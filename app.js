(function () {
  var CITY_STORAGE_KEY = "weather-snapshots-cities";
  var defaultCities = [
    {
      name: "Amsterdam",
      region: "North Holland, Netherlands",
      latitude: 52.3676,
      longitude: 4.9041,
      timezone: "Europe/Amsterdam",
    },
    {
      name: "Chengdu",
      region: "Sichuan, China",
      latitude: 30.5728,
      longitude: 104.0668,
      timezone: "Asia/Shanghai",
    },
    {
      name: "Helsinki",
      region: "Uusimaa, Finland",
      latitude: 60.1699,
      longitude: 24.9384,
      timezone: "Europe/Helsinki",
    },
    {
      name: "Stockholm",
      region: "Stockholm County, Sweden",
      latitude: 59.3293,
      longitude: 18.0686,
      timezone: "Europe/Stockholm",
    },
  ];
  var trackedCities = loadSavedCities();

  var weatherCodeMap = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Heavy showers",
    82: "Violent showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Storm with hail",
    99: "Severe hail storm",
  };

  var cardsContainer = document.querySelector("#cardsContainer");
  var tabsContainer = document.querySelector("#tabsContainer");
  var refreshButton = document.querySelector("#refreshButton");
  var statusText = document.querySelector("#statusText");
  var cityCount = document.querySelector("#cityCount");
  var cityForm = document.querySelector("#cityForm");
  var cityInput = document.querySelector("#cityInput");
  var citySuggestions = document.querySelector("#citySuggestions");
  var addCityButton = document.querySelector("#addCityButton");
  var cityFormMessage = document.querySelector("#cityFormMessage");
  var cityCardTemplate = document.querySelector("#cityCardTemplate");
  var activeCityKey = "";
  var activeDateKey = "";
  var activeView = "details";
  var showFullDay = false;
  var hintTimer = 0;
  var latestHintQuery = "";
  var preferredCityIndex = buildPreferredCityIndex(defaultCities);

  function isValidCity(city) {
    return (
      city &&
      typeof city.name === "string" &&
      typeof city.region === "string" &&
      typeof city.latitude === "number" &&
      typeof city.longitude === "number" &&
      typeof city.timezone === "string"
    );
  }

  function loadSavedCities() {
    var savedCities;

    try {
      savedCities = JSON.parse(window.localStorage.getItem(CITY_STORAGE_KEY));
      if (
        Array.isArray(savedCities) &&
        savedCities.length > 0 &&
        savedCities.every(isValidCity)
      ) {
        return savedCities;
      }
    } catch (error) {
      console.warn("Unable to load saved cities.", error);
    }

    return defaultCities.slice();
  }

  function saveCities() {
    try {
      window.localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify(trackedCities));
    } catch (error) {
      console.warn("Unable to save cities.", error);
    }
  }

  function celsiusToFahrenheit(value) {
    return (value * 9) / 5 + 32;
  }

  function getWindDescriptor(speedKmh) {
    if (speedKmh < 2) return "Calm";
    if (speedKmh < 12) return "Light";
    if (speedKmh < 29) return "Breezy";
    if (speedKmh < 50) return "Windy";
    if (speedKmh < 75) return "Strong";
    return "Severe";
  }

  function getCompassDirection(degrees) {
    var directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    var normalized = ((degrees % 360) + 360) % 360;
    var index = Math.round(normalized / 45) % directions.length;
    return directions[index];
  }

  function getDirectionArrow(direction) {
    var arrowMap = {
      N: "\u2191",
      NE: "\u2197",
      E: "\u2192",
      SE: "\u2198",
      S: "\u2193",
      SW: "\u2199",
      W: "\u2190",
      NW: "\u2196",
    };

    return arrowMap[direction] || "\u2192";
  }

  function formatLocalHour(isoTime) {
    var hour = Number(isoTime.slice(11, 13));
    var suffix = hour >= 12 ? "PM" : "AM";
    var displayHour = hour % 12;

    if (displayHour === 0) {
      displayHour = 12;
    }

    return displayHour + ":00 " + suffix;
  }

  function isTwoHourStep(isoTime) {
    return Number(isoTime.slice(11, 13)) % 2 === 0;
  }

  function formatUpdatedAt(timezone) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(new Date());
  }

  function getCurrentCityHourStamp(timezone) {
    var formatter = new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      timeZone: timezone,
    });
    var parts = formatter.formatToParts(new Date());
    var value = {};
    var index;

    for (index = 0; index < parts.length; index += 1) {
      value[parts[index].type] = parts[index].value;
    }

    return value.year + "-" + value.month + "-" + value.day + "T" + value.hour + ":00";
  }

  function getCurrentCityDateKey(timezone) {
    return getCurrentCityHourStamp(timezone).slice(0, 10);
  }

  function getHighlightedTimeLabel(timezone) {
    var currentHourStamp = getCurrentCityHourStamp(timezone);
    var hour = Number(currentHourStamp.slice(11, 13));
    var roundedHour = hour % 2 === 0 ? hour : hour + 1;
    var adjustedStamp;

    if (roundedHour === 24) {
      roundedHour = 0;
    }

    adjustedStamp = currentHourStamp.slice(0, 11) + String(roundedHour).padStart(2, "0") + ":00";
    return formatLocalHour(adjustedStamp);
  }

  function getShouldShowFullDay() {
    return showFullDay;
  }

  function formatDateLabel(dateKey, timezone) {
    var parts = dateKey.split("-");
    var date;

    if (parts.length < 3) {
      return "";
    }

    date = new Date(Date.UTC(parts[0], Number(parts[1]) - 1, parts[2], 12, 0, 0));

    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: timezone,
    }).format(date);
  }

  function formatWeekdayLabel(dateKey, timezone) {
    var parts = dateKey.split("-");
    var date;

    if (parts.length < 3) {
      return "";
    }

    date = new Date(Date.UTC(parts[0], Number(parts[1]) - 1, parts[2], 12, 0, 0));

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: timezone,
    }).format(date);
  }

  function buildMobileDateSelect(dateKeys, selectedDateKey, currentDateKey, timezone) {
    var wrapper = document.createElement("label");
    var label = document.createElement("span");
    var select = document.createElement("select");

    wrapper.className = "mobile-date-picker";
    label.className = "mobile-date-label";
    label.textContent = "Choose forecast date";
    select.className = "mobile-date-select";
    select.setAttribute("aria-label", "Choose forecast date");

    dateKeys.forEach(function (dateKey) {
      var option = document.createElement("option");
      option.value = dateKey;
      option.textContent =
        formatDateLabel(dateKey, timezone) + (dateKey === currentDateKey ? " - Today" : "");
      option.selected = dateKey === selectedDateKey;
      select.appendChild(option);
    });

    select.addEventListener("change", function () {
      activeDateKey = select.value;
      renderCityCards(lastRenderedWeatherList);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    return wrapper;
  }

  function renderError(message) {
    if (tabsContainer) {
      tabsContainer.innerHTML = "";
    }

    cardsContainer.innerHTML = '<div class="error-card">' + message + "</div>";
  }

  function setFormMessage(message) {
    cityFormMessage.textContent = message;
  }

  function updateCityCount() {
    if (cityCount) {
      cityCount.textContent = trackedCities.length + " monitored";
    }
  }

  function slugifyCity(city) {
    return (
      city.name +
      "-" +
      city.latitude +
      "-" +
      city.longitude +
      "-" +
      city.timezone
    ).toLowerCase();
  }

  function buildPreferredCityIndex(cities) {
    var index = {};

    cities.forEach(function (city) {
      var key = normalizeLookupToken(city.name);
      if (!index[key]) {
        index[key] = [];
      }

      index[key].push(city);
    });

    return index;
  }

  function getCityDisplayName(city) {
    if (city.country && city.name !== city.country) {
      return city.name + ", " + city.country;
    }

    return city.name;
  }

  function getCityRegion(city) {
    var parts = [];

    if (city.admin1 && city.admin1 !== city.name && city.admin1 !== city.country) {
      parts.push(city.admin1);
    }

    if (city.country) {
      parts.push(city.country);
    } else if (city.region) {
      parts.push(city.region);
    }

    return parts.join(", ");
  }

  function getSuggestionLabel(city) {
    var parts = [city.name];

    if (city.admin1 && city.admin1 !== city.name && city.admin1 !== city.country) {
      parts.push(city.admin1);
    }

    if (city.country) {
      parts.push(city.country);
    }

    return parts.join(", ");
  }

  function createWeatherUrl(city) {
    var params = new URLSearchParams({
      latitude: String(city.latitude),
      longitude: String(city.longitude),
      hourly: [
        "temperature_2m",
        "relative_humidity_2m",
        "dew_point_2m",
        "rain",
        "uv_index",
        "wind_speed_10m",
        "wind_direction_10m",
        "weather_code",
      ].join(","),
      past_days: "1",
      forecast_days: "15",
      timezone: city.timezone,
    });

    return "https://api.open-meteo.com/v1/forecast?" + params.toString();
  }

  function getHourlySeries(payload, fieldName) {
    return payload && payload.hourly && Array.isArray(payload.hourly[fieldName])
      ? payload.hourly[fieldName]
      : null;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function getOptionalNumber(series, index) {
    var value = series ? series[index] : null;
    return isFiniteNumber(value) ? value : null;
  }

  function formatOptionalNumber(value, suffix) {
    return isFiniteNumber(value) ? value.toFixed(1) + suffix : "Unavailable";
  }

  function formatOptionalPercent(value) {
    return isFiniteNumber(value) ? value + "%" : "Unavailable";
  }

  function getBestMetricRow(rows, valueGetter, compare) {
    var rowsWithValue = rows.filter(function (row) {
      return isFiniteNumber(valueGetter(row));
    });

    if (rowsWithValue.length === 0) {
      return null;
    }

    return rowsWithValue.reduce(function (best, row) {
      return compare(valueGetter(row), valueGetter(best)) ? row : best;
    });
  }

  function createGeocodingUrl(query) {
    var parsedQuery = parseCityQuery(query);
    var params = new URLSearchParams({
      name: parsedQuery.city,
      count: parsedQuery.city.length <= 2 ? "100" : "30",
      language: "en",
      format: "json",
    });

    return "https://geocoding-api.open-meteo.com/v1/search?" + params.toString();
  }

  function parseCityQuery(query) {
    var parts = query
      .split(",")
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);

    return {
      city: parts[0] || query.trim(),
      region: parts.length > 2 ? parts.slice(1, parts.length - 1).join(", ") : parts[1] || "",
      country: parts.length > 1 ? parts[parts.length - 1] : "",
    };
  }

  function normalizeLookupToken(value) {
    return (value || "").toLowerCase().replace(/\./g, "").trim();
  }

  function matchesLookupToken(source, token) {
    var normalizedSource = normalizeLookupToken(source);
    var normalizedToken = normalizeLookupToken(token);

    if (!normalizedToken) {
      return true;
    }

    return normalizedSource.indexOf(normalizedToken) !== -1;
  }

  function scoreCityResult(result, parsedQuery) {
    var score = 0;
    var preferredMatches = preferredCityIndex[normalizeLookupToken(parsedQuery.city)] || [];
    var normalizedCity = normalizeLookupToken(parsedQuery.city);
    var normalizedResultName = normalizeLookupToken(result.name);

    if (matchesLookupToken(result.name, parsedQuery.city)) {
      score += 5;
    }

    if (normalizedCity && normalizedResultName.indexOf(normalizedCity) === 0) {
      score += 6;
    }

    if (normalizedCity && normalizedResultName === normalizedCity) {
      score += 4;
    }

    if (parsedQuery.region) {
      if (matchesLookupToken(result.admin1, parsedQuery.region)) {
        score += 3;
      } else {
        score -= 2;
      }
    }

    if (parsedQuery.country) {
      if (matchesLookupToken(result.country, parsedQuery.country)) {
        score += 3;
      } else {
        score -= 2;
      }
    }

    preferredMatches.forEach(function (preferredCity) {
      if (
        Math.abs((result.latitude || 0) - preferredCity.latitude) < 0.2 &&
        Math.abs((result.longitude || 0) - preferredCity.longitude) < 0.2
      ) {
        score += 10;
      }

      if (
        matchesLookupToken(result.admin1, preferredCity.region) ||
        matchesLookupToken(result.country, preferredCity.region) ||
        matchesLookupToken(result.timezone, preferredCity.timezone)
      ) {
        score += 4;
      }
    });

    return score;
  }

  function pickBestCityResult(results, parsedQuery) {
    var rankedResults = results.slice();

    rankedResults.sort(function (left, right) {
      return scoreCityResult(right, parsedQuery) - scoreCityResult(left, parsedQuery);
    });

    return rankedResults[0];
  }

  function filterHintResults(results, parsedQuery) {
    var normalizedCity = normalizeLookupToken(parsedQuery.city);
    var filteredResults;

    if (!normalizedCity) {
      return results;
    }

    filteredResults = results.filter(function (result) {
      return normalizeLookupToken(result.name).indexOf(normalizedCity) === 0;
    });

    if (parsedQuery.country) {
      filteredResults = filteredResults.filter(function (result) {
        return matchesLookupToken(result.country, parsedQuery.country);
      });
    }

    if (parsedQuery.region) {
      filteredResults = filteredResults.filter(function (result) {
        return matchesLookupToken(result.admin1, parsedQuery.region);
      });
    }

    if (filteredResults.length > 0) {
      return filteredResults;
    }

    return results;
  }

  function getWeatherIcon(weatherCode) {
    if (weatherCode === 0 || weatherCode === 1) return "\u2600\uFE0F";
    if (weatherCode === 2) return "\u26C5";
    if (weatherCode === 3) return "\u2601\uFE0F";
    if (weatherCode === 45 || weatherCode === 48) return "\uD83C\uDF2B\uFE0F";
    if (weatherCode >= 51 && weatherCode <= 57) return "\uD83C\uDF26\uFE0F";
    if ((weatherCode >= 61 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) {
      return "\uD83C\uDF27\uFE0F";
    }
    if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) {
      return "\u2744\uFE0F";
    }
    if (weatherCode >= 95) return "\u26C8\uFE0F";
    return "\uD83C\uDF24\uFE0F";
  }

  function normalizeCityData(city, payload) {
    var groupedRows = {};
    var orderedDateKeys = [];
    var currentDateKey = getCurrentCityDateKey(city.timezone);
    var times = getHourlySeries(payload, "time");
    var temperatures = getHourlySeries(payload, "temperature_2m");
    var humidities = getHourlySeries(payload, "relative_humidity_2m");
    var dewPoints = getHourlySeries(payload, "dew_point_2m");
    var rainValues = getHourlySeries(payload, "rain");
    var uvIndexes = getHourlySeries(payload, "uv_index");
    var windSpeeds = getHourlySeries(payload, "wind_speed_10m");
    var windDirections = getHourlySeries(payload, "wind_direction_10m");
    var weatherCodes = getHourlySeries(payload, "weather_code");
    var rows;

    if (!times) {
      throw new Error(city.name + " returned an incomplete weather response.");
    }

    rows = times.reduce(function (validRows, isoTime, index) {
      var temperatureC = getOptionalNumber(temperatures, index);
      var humidity = getOptionalNumber(humidities, index);
      var dewPoint = getOptionalNumber(dewPoints, index);
      var rain = getOptionalNumber(rainValues, index);
      var uvIndex = getOptionalNumber(uvIndexes, index);
      var windSpeed = getOptionalNumber(windSpeeds, index);
      var windDirection = getOptionalNumber(windDirections, index);
      var hasWindData = isFiniteNumber(windSpeed) && isFiniteNumber(windDirection);
      var windDirectionLabel = hasWindData ? getCompassDirection(windDirection) : "";
      var weatherCode = getOptionalNumber(weatherCodes, index);
      var dateKey;
      var row;

      if (typeof isoTime !== "string") {
        return validRows;
      }

      dateKey = isoTime.slice(0, 10);
      row = {
        dateKey: dateKey,
        isoTime: isoTime,
        hour: formatLocalHour(isoTime),
        temperatureC: temperatureC,
        temperatureF: isFiniteNumber(temperatureC) ? celsiusToFahrenheit(temperatureC) : null,
        humidity: humidity,
        dewPoint: dewPoint,
        rain: rain,
        uvIndex: uvIndex,
        windSpeed: hasWindData ? windSpeed : null,
        wind: hasWindData
          ? getWindDescriptor(windSpeed) +
            " " +
            windSpeed.toFixed(1) +
            " km/h " +
            getDirectionArrow(windDirectionLabel) +
            " " +
            windDirectionLabel
          : "Unavailable",
        conditionIcon: isFiniteNumber(weatherCode) ? getWeatherIcon(weatherCode) : "",
        condition: isFiniteNumber(weatherCode) ? weatherCodeMap[weatherCode] || "Unknown" : "Unavailable",
      };

      if (!groupedRows[dateKey]) {
        groupedRows[dateKey] = [];
        orderedDateKeys.push(dateKey);
      }

      groupedRows[dateKey].push(row);

      validRows.push(row);
      return validRows;
    }, []);

    if (rows.length === 0) {
      throw new Error(city.name + " returned no usable hourly weather rows.");
    }

    return {
      name: city.name,
      region: city.region,
      updatedAt: formatUpdatedAt(city.timezone),
      timezone: city.timezone,
      currentDateKey: currentDateKey,
      availableDateKeys: orderedDateKeys,
      rowsByDate: groupedRows,
      cityKey: slugifyCity(city),
      condition: rows.length > 0 ? rows[0].condition : "Unavailable",
    };
  }

  function createUnavailableCityData(city, message) {
    var currentDateKey = getCurrentCityDateKey(city.timezone);
    var rowsByDate = {};

    rowsByDate[currentDateKey] = [];

    return {
      name: city.name,
      region: city.region,
      updatedAt: "unavailable",
      timezone: city.timezone,
      currentDateKey: currentDateKey,
      availableDateKeys: [currentDateKey],
      rowsByDate: rowsByDate,
      cityKey: slugifyCity(city),
      condition: "Unavailable",
      unavailableMessage: message,
    };
  }

  function getSelectedDateKey(cityWeather) {
    if (
      activeDateKey &&
      cityWeather.availableDateKeys.indexOf(activeDateKey) !== -1
    ) {
      return activeDateKey;
    }

    if (cityWeather.availableDateKeys.indexOf(cityWeather.currentDateKey) !== -1) {
      return cityWeather.currentDateKey;
    }

    return cityWeather.availableDateKeys[0] || "";
  }

  function buildCityCard(cityWeather) {
    var card = cityCardTemplate.content.firstElementChild.cloneNode(true);
    var body = card.querySelector("tbody");
    var dateSwitcher = card.querySelector(".date-switcher");
    var dateNav = card.querySelector(".date-nav");
    var dateLabel = card.querySelector(".date-label");
    var viewToggle = card.querySelector(".view-toggle");
    var selectedDateKey = getSelectedDateKey(cityWeather);
    var allRows = cityWeather.rowsByDate[selectedDateKey] || [];
    var isFullDay = getShouldShowFullDay();
    var rows = isFullDay
      ? allRows
      : allRows.filter(function (row) {
          return isTwoHourStep(row.isoTime);
        });
    var summaryRow = rows[12] || rows[0];
    var currentDateKey = getCurrentCityDateKey(cityWeather.timezone);
    var highlightedTimeLabel = isFullDay
      ? formatLocalHour(getCurrentCityHourStamp(cityWeather.timezone))
      : getHighlightedTimeLabel(cityWeather.timezone);

    card.querySelector(".city-region").textContent = cityWeather.region;
    card.querySelector(".city-name").textContent = cityWeather.name;
    card.querySelector(".city-badge").textContent = summaryRow ? summaryRow.condition : cityWeather.condition;
    card.querySelector(".updated-time").textContent =
      cityWeather.updatedAt === "unavailable"
        ? "Weather details unavailable"
        : "Local time updated " + cityWeather.updatedAt;
    dateLabel.textContent = formatDateLabel(selectedDateKey, cityWeather.timezone);
    viewToggle.textContent = isFullDay ? "Show every 2 hours" : "Show 24 hours";
    dateSwitcher.insertBefore(
      buildMobileDateSelect(
        cityWeather.availableDateKeys,
        selectedDateKey,
        currentDateKey,
        cityWeather.timezone,
      ),
      dateNav,
    );

    cityWeather.availableDateKeys.forEach(function (dateKey) {
      var chip = document.createElement("button");
      var className = "date-chip";

      if (dateKey === selectedDateKey) {
        className += " is-active";
      }

      if (dateKey === currentDateKey) {
        className += " is-today";
      }

      chip.type = "button";
      chip.className = className;
      chip.textContent = formatWeekdayLabel(dateKey, cityWeather.timezone);
      chip.addEventListener("click", function () {
        activeDateKey = dateKey;
        renderCityCards(lastRenderedWeatherList);
      });
      dateNav.appendChild(chip);
    });

    viewToggle.addEventListener("click", function () {
      showFullDay = !isFullDay;
      renderCityCards(lastRenderedWeatherList);
    });

    if (rows.length === 0) {
      var unavailableRow = document.createElement("tr");
      unavailableRow.innerHTML =
        '<td colspan="9">' +
        (cityWeather.unavailableMessage || "Weather details are unavailable. Try refreshing shortly.") +
        "</td>";
      body.appendChild(unavailableRow);
    }

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      if (selectedDateKey === currentDateKey && row.hour === highlightedTimeLabel) {
        tr.className = tr.className ? tr.className + " current-hour-row" : "current-hour-row";
      }
      tr.innerHTML =
        "<td>" +
        row.hour +
        "</td>" +
        "<td>" +
        formatOptionalNumber(row.temperatureC, " C") +
        "</td>" +
        "<td>" +
        formatOptionalNumber(row.temperatureF, " F") +
        "</td>" +
        "<td>" +
        formatOptionalPercent(row.humidity) +
        "</td>" +
        "<td>" +
        formatOptionalNumber(row.dewPoint, " C") +
        "</td>" +
        "<td>" +
        formatOptionalNumber(row.rain, " mm") +
        "</td>" +
        "<td>" +
        formatOptionalNumber(row.uvIndex, "") +
        "</td>" +
        "<td>" +
        '<span class="condition-cell"><span class="condition-icon" aria-hidden="true">' +
        row.conditionIcon +
        "</span><span>" +
        row.condition +
        "</span></span>" +
        "</td>" +
        "<td>" +
        row.wind +
        "</td>";
      body.appendChild(tr);
    });

    return card;
  }

  function buildComparisonCard(cityWeatherList) {
    var card = document.createElement("article");
    var header = document.createElement("div");
    var headingGroup = document.createElement("div");
    var eyebrow = document.createElement("p");
    var title = document.createElement("h2");
    var dateSwitcher = document.createElement("div");
    var dateNav = document.createElement("div");
    var dateLabel = document.createElement("p");
    var mobileDatePicker;
    var charts = document.createElement("div");
    var referenceCity = cityWeatherList[0];
    var selectedDateKey;
    var citySummaries = [];
    var metrics;

    card.className = "city-card comparison-card";
    header.className = "card-header";
    eyebrow.className = "city-region";
    eyebrow.textContent = "Selected cities";
    title.className = "city-name";
    title.textContent = "Weather comparison";
    headingGroup.appendChild(eyebrow);
    headingGroup.appendChild(title);
    header.appendChild(headingGroup);
    card.appendChild(header);

    if (!referenceCity) {
      return card;
    }

    selectedDateKey = getSelectedDateKey(referenceCity);
    dateSwitcher.className = "date-switcher comparison-date-switcher";
    dateNav.className = "date-nav";
    dateLabel.className = "date-label";
    dateLabel.textContent = formatDateLabel(selectedDateKey, referenceCity.timezone);
    mobileDatePicker = buildMobileDateSelect(
      referenceCity.availableDateKeys,
      selectedDateKey,
      referenceCity.currentDateKey,
      referenceCity.timezone,
    );

    referenceCity.availableDateKeys.forEach(function (dateKey) {
      var chip = document.createElement("button");
      var className = "date-chip";

      if (dateKey === selectedDateKey) {
        className += " is-active";
      }

      if (dateKey === referenceCity.currentDateKey) {
        className += " is-today";
      }

      chip.type = "button";
      chip.className = className;
      chip.textContent = formatWeekdayLabel(dateKey, referenceCity.timezone);
      chip.addEventListener("click", function () {
        activeDateKey = dateKey;
        renderCityCards(lastRenderedWeatherList);
      });
      dateNav.appendChild(chip);
    });

    dateSwitcher.appendChild(mobileDatePicker);
    dateSwitcher.appendChild(dateNav);
    dateSwitcher.appendChild(dateLabel);
    card.appendChild(dateSwitcher);

    cityWeatherList.forEach(function (cityWeather) {
      var rowsForDate = cityWeather.rowsByDate[selectedDateKey] || [];
      var highestTemperature;
      var lowestTemperature;
      var highestUv;
      var highestDewPoint;
      var highestHumidity;
      var strongestWind;
      var conditionCounts = {};
      var dominantCondition;

      if (rowsForDate.length === 0) {
        return;
      }

      highestTemperature = getBestMetricRow(
        rowsForDate,
        function (row) {
          return row.temperatureC;
        },
        function (value, bestValue) {
          return value > bestValue;
        },
      );
      lowestTemperature = getBestMetricRow(
        rowsForDate,
        function (row) {
          return row.temperatureC;
        },
        function (value, bestValue) {
          return value < bestValue;
        },
      );
      highestUv = getBestMetricRow(
        rowsForDate,
        function (row) {
          return row.uvIndex;
        },
        function (value, bestValue) {
          return value > bestValue;
        },
      );
      highestDewPoint = getBestMetricRow(
        rowsForDate,
        function (row) {
          return row.dewPoint;
        },
        function (value, bestValue) {
          return value > bestValue;
        },
      );
      highestHumidity = getBestMetricRow(
        rowsForDate,
        function (row) {
          return row.humidity;
        },
        function (value, bestValue) {
          return value > bestValue;
        },
      );
      strongestWind = getBestMetricRow(
        rowsForDate,
        function (row) {
          return row.windSpeed;
        },
        function (value, bestValue) {
          return value > bestValue;
        },
      );
      rowsForDate.forEach(function (row) {
        var key = row.condition;

        if (!conditionCounts[key]) {
          conditionCounts[key] = {
            count: 0,
            condition: row.condition,
            conditionIcon: row.conditionIcon,
          };
        }

        conditionCounts[key].count += 1;
      });
      dominantCondition = Object.keys(conditionCounts).reduce(function (best, key) {
        var candidate = conditionCounts[key];
        return !best || candidate.count > best.count ? candidate : best;
      }, null);

      citySummaries.push({
        name: cityWeather.name,
        highestTemperature: highestTemperature,
        lowestTemperature: lowestTemperature,
        highestUv: highestUv,
        highestDewPoint: highestDewPoint,
        highestHumidity: highestHumidity,
        strongestWind: strongestWind,
        dominantCondition: dominantCondition,
      });
    });

    metrics = [
      {
        key: "highestTemperature",
        title: "Highest temperature",
        className: "metric-hot",
        value: function (row) {
          return row.temperatureC;
        },
        label: function (row) {
          return row.temperatureC.toFixed(1) + " C at " + row.hour;
        },
      },
      {
        key: "lowestTemperature",
        title: "Lowest temperature",
        className: "metric-cold",
        value: function (row) {
          return row.temperatureC;
        },
        label: function (row) {
          return row.temperatureC.toFixed(1) + " C at " + row.hour;
        },
      },
      {
        key: "highestHumidity",
        title: "Highest humidity",
        className: "metric-humidity",
        value: function (row) {
          return row.humidity;
        },
        label: function (row) {
          return row.humidity + "% at " + row.hour;
        },
      },
      {
        key: "highestDewPoint",
        title: "Highest dew point",
        className: "metric-dew",
        value: function (row) {
          return row.dewPoint;
        },
        label: function (row) {
          return row.dewPoint.toFixed(1) + " C at " + row.hour;
        },
      },
      {
        key: "highestUv",
        title: "Highest UV index",
        className: "metric-uv",
        value: function (row) {
          return row.uvIndex;
        },
        label: function (row) {
          return row.uvIndex.toFixed(1) + " at " + row.hour;
        },
      },
      {
        key: "strongestWind",
        title: "Strongest wind",
        className: "metric-wind",
        value: function (row) {
          return row.windSpeed;
        },
        label: function (row) {
          return row.windSpeed.toFixed(1) + " km/h at " + row.hour;
        },
      },
    ];

    charts.className = "comparison-charts";

    (function addConditionComparison() {
      var chart = document.createElement("section");
      var chartTitle = document.createElement("h3");
      var conditionGrid = document.createElement("div");

      chart.className = "metric-chart metric-condition";
      chartTitle.textContent = "Dominant condition";
      conditionGrid.className = "condition-comparison";
      chart.appendChild(chartTitle);

      citySummaries.forEach(function (summary) {
        var item = document.createElement("div");
        var city = document.createElement("strong");
        var condition = document.createElement("span");

        item.className = "condition-comparison-item";
        city.textContent = summary.name;
        condition.className = "condition-cell";
        condition.innerHTML =
          '<span class="condition-icon" aria-hidden="true">' +
          summary.dominantCondition.conditionIcon +
          "</span><span>" +
          summary.dominantCondition.condition +
          "</span>";
        item.appendChild(city);
        item.appendChild(condition);
        conditionGrid.appendChild(item);
      });

      chart.appendChild(conditionGrid);
      charts.appendChild(chart);
    })();

    metrics.forEach(function (metric) {
      var chart = document.createElement("section");
      var chartTitle = document.createElement("h3");
      var chartSummaries = citySummaries.filter(function (summary) {
        return summary[metric.key];
      });
      var values;
      var minimum;
      var maximum;
      var span;

      if (chartSummaries.length === 0) {
        return;
      }

      values = chartSummaries.map(function (summary) {
        return metric.value(summary[metric.key]);
      });
      minimum = Math.min.apply(null, values);
      maximum = Math.max.apply(null, values);
      span = maximum - minimum;

      chart.className = "metric-chart " + metric.className;
      chartTitle.textContent = metric.title;
      chart.appendChild(chartTitle);

      chartSummaries.forEach(function (summary) {
        var row = document.createElement("div");
        var city = document.createElement("strong");
        var track = document.createElement("div");
        var fill = document.createElement("span");
        var value = document.createElement("span");
        var metricRow = summary[metric.key];
        var numericValue = metric.value(metricRow);
        var width = span === 0 ? 100 : 35 + ((numericValue - minimum) / span) * 65;

        row.className = "metric-row";
        city.className = "metric-city";
        city.textContent = summary.name;
        track.className = "metric-track";
        fill.className = "metric-fill";
        fill.style.width = width + "%";
        value.className = "metric-value";
        value.textContent = metric.label(metricRow);
        track.appendChild(fill);
        row.appendChild(city);
        row.appendChild(track);
        row.appendChild(value);
        chart.appendChild(row);
      });

      charts.appendChild(chart);
    });

    card.appendChild(charts);

    return card;
  }

  var lastRenderedWeatherList = [];

  function renderTabs(cityWeatherList) {
    var detailsButton;
    tabsContainer.innerHTML = "";

    detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "city-tab details-tab";
    detailsButton.setAttribute("role", "tab");
    detailsButton.setAttribute("aria-selected", activeView === "details" ? "true" : "false");
    detailsButton.innerHTML =
      '<span class="details-tab-icon" aria-hidden="true">&#9638;</span><span>Comparison</span>';
    detailsButton.addEventListener("click", function () {
      activeView = "details";
      renderCityCards(cityWeatherList);
    });
    tabsContainer.appendChild(detailsButton);

    cityWeatherList.forEach(function (cityWeather) {
      var button = document.createElement("button");
      var content = document.createElement("span");
      var label = document.createElement("span");
      var remove = document.createElement("button");
      button.type = "button";
      button.className = "city-tab";
      button.setAttribute("role", "tab");
      button.setAttribute(
        "aria-selected",
        activeView === "city" && cityWeather.cityKey === activeCityKey ? "true" : "false",
      );
      button.addEventListener("click", function () {
        activeView = "city";
        activeCityKey = cityWeather.cityKey;
        renderCityCards(cityWeatherList);
      });

      content.className = "city-tab-content";
      label.textContent = cityWeather.name;
      remove.type = "button";
      remove.className = "remove-city";
      remove.setAttribute("aria-label", "Remove " + cityWeather.name);
      remove.textContent = "x";
      remove.addEventListener("click", function (event) {
        event.stopPropagation();
        removeCity(cityWeather.cityKey);
      });

      content.appendChild(label);
      content.appendChild(remove);
      button.appendChild(content);
      tabsContainer.appendChild(button);
    });
  }

  function renderCityCards(cityWeatherList) {
    var selectedCity;
    lastRenderedWeatherList = cityWeatherList;

    if (!activeCityKey && cityWeatherList.length > 0) {
      activeCityKey = cityWeatherList[0].cityKey;
    }

    selectedCity = cityWeatherList.find(function (cityWeather) {
      return cityWeather.cityKey === activeCityKey;
    }) || cityWeatherList[0];

    if (selectedCity && (!activeDateKey || selectedCity.availableDateKeys.indexOf(activeDateKey) === -1)) {
      activeDateKey = selectedCity.currentDateKey;
    }

    cardsContainer.innerHTML = "";
    renderTabs(cityWeatherList);

    if (activeView === "details") {
      cardsContainer.appendChild(buildComparisonCard(cityWeatherList));
    } else if (selectedCity) {
      cardsContainer.appendChild(buildCityCard(selectedCity));
    }
  }

  function removeCity(cityKey) {
    var removedCity;

    if (trackedCities.length <= 1) {
      setFormMessage("Keep at least one city in the dashboard.");
      return;
    }

    removedCity = trackedCities.find(function (city) {
      return slugifyCity(city) === cityKey;
    });

    trackedCities = trackedCities.filter(function (city) {
      return slugifyCity(city) !== cityKey;
    });

    if (activeCityKey === cityKey && trackedCities.length > 0) {
      activeCityKey = slugifyCity(trackedCities[0]);
      activeDateKey = "";
    }

    updateCityCount();
    saveCities();
    setFormMessage((removedCity ? removedCity.name : "City") + " removed from the dashboard.");
    loadWeather();
  }

  function fetchWithTimeout(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var timeoutId = window.setTimeout(function () {
        reject(new Error("Request timed out."));
      }, timeoutMs);

      fetch(url)
        .then(function (response) {
          window.clearTimeout(timeoutId);
          resolve(response);
        })
        .catch(function (error) {
          window.clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  function createWeatherFetchError(city, response) {
    var message;
    var error;

    if (response.status === 429) {
      message =
        city.name +
        " is saved, but the weather service is rate limiting requests. Try Refresh weather again in a minute.";
    } else if (response.status >= 500) {
      message =
        city.name +
        " is saved, but the weather service is temporarily unavailable. Try refreshing again shortly.";
    } else {
      message = city.name + " returned " + response.status + " " + response.statusText + ".";
    }

    error = new Error(message);
    error.cityName = city.name;
    error.cityKey = slugifyCity(city);
    error.status = response.status;
    return error;
  }

  function fetchCityWeather(city) {
    return fetchWithTimeout(createWeatherUrl(city), 12000)
      .then(function (response) {
        if (!response.ok) {
          throw createWeatherFetchError(city, response);
        }

        return response.json();
      })
      .then(function (payload) {
        return normalizeCityData(city, payload);
      });
  }

  function fetchWeatherForCities(cities) {
    var results = [];

    return cities
      .reduce(function (chain, city) {
        return chain.then(function () {
          return fetchCityWeather(city).then(
            function (value) {
              results.push({
                status: "fulfilled",
                value: value,
              });
            },
            function (reason) {
              results.push({
                status: "rejected",
                city: city,
                reason: reason,
              });
            },
          );
        });
      }, Promise.resolve())
      .then(function () {
        return results;
      });
  }

  function loadWeather(options) {
    var addedCityName = options && options.addedCityName;
    var addedCityKey = options && options.addedCityKey;

    refreshButton.disabled = true;
    statusText.textContent = "Refreshing hourly forecast...";

    fetchWeatherForCities(trackedCities)
      .then(function (results) {
        var cityWeatherResponses = [];
        var failedMessages = [];
        var addedCityFailure;
        var addedCityLoaded = false;
        var loadedCityCount = 0;

        results.forEach(function (result) {
          if (result.status === "fulfilled") {
            cityWeatherResponses.push(result.value);
            loadedCityCount += 1;
            if (result.value.cityKey === addedCityKey) {
              addedCityLoaded = true;
            }
          } else {
            if (result.reason && result.reason.cityKey === addedCityKey) {
              addedCityFailure = result.reason;
            }
            if (result.city) {
              cityWeatherResponses.push(
                createUnavailableCityData(
                  result.city,
                  result.reason && result.reason.message ? result.reason.message : "Weather details are unavailable.",
                ),
              );
            }
            failedMessages.push(result.reason && result.reason.message ? result.reason.message : "Unknown error");
          }
        });

        if (cityWeatherResponses.length > 0) {
          renderCityCards(cityWeatherResponses);
          if (addedCityLoaded) {
            setFormMessage(addedCityName + " added. Weather loaded.");
          } else if (addedCityFailure) {
            setFormMessage(addedCityFailure.message);
          }
          statusText.textContent =
            "Showing available measurements by default, with optional 24-hour view, from yesterday through the next 14 days for " +
            loadedCityCount +
            " of " +
            cityWeatherResponses.length +
            " cities" +
            (failedMessages.length ? ". Some cities could not refresh: " + failedMessages.join(" ") : ".");
          return;
        }

        renderError(
          "The weather feed could not be loaded. Open-Meteo may be temporarily unreachable from this browser, or the page may be blocked by local file/network settings. Try http://localhost:8080 with the included PowerShell server, then refresh.",
        );
        if (addedCityFailure) {
          setFormMessage(addedCityFailure.message);
        }
        statusText.textContent = "Unable to refresh weather right now.";
      })
      .catch(function (error) {
        console.error(error);
        renderError(
          "The weather feed could not be loaded because the browser hit an unexpected error. Try refreshing, or run the included PowerShell server and open http://localhost:8080.",
        );
        statusText.textContent = "Unable to refresh weather right now.";
      })
      .finally(function () {
        refreshButton.disabled = false;
      });
  }

  function addCity(city) {
    var incomingSlug = slugifyCity(city);
    var exists = trackedCities.some(function (trackedCity) {
      return slugifyCity(trackedCity) === incomingSlug;
    });

    if (exists) {
      activeCityKey = incomingSlug;
      activeDateKey = "";
      setFormMessage(city.name + " is already in the dashboard.");
      loadWeather();
      return;
    }

    trackedCities = trackedCities.concat(city);
    activeCityKey = incomingSlug;
    activeDateKey = "";
    updateCityCount();
    saveCities();
    setFormMessage(city.name + " added. Loading weather now.");
    loadWeather({
      addedCityName: city.name,
      addedCityKey: incomingSlug,
    });
  }

  function resolveCity(query) {
    var parsedQuery = parseCityQuery(query);

    return fetchWithTimeout(createGeocodingUrl(query), 12000)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("City lookup failed.");
        }

        return response.json();
      })
      .then(function (payload) {
        var result;
        if (!payload.results || payload.results.length === 0) {
          throw new Error('No city matched "' + query + '".');
        }

        result = pickBestCityResult(payload.results, parsedQuery);

        return {
          name: result.name,
          admin1: result.admin1 || "",
          country: result.country || "",
          displayName: getCityDisplayName(result),
          region: getCityRegion(result),
          latitude: result.latitude,
          longitude: result.longitude,
          timezone: result.timezone,
        };
      });
  }

  function updateSuggestionHints(results) {
    if (!citySuggestions) {
      return;
    }

    citySuggestions.innerHTML = "";

    results.slice(0, 5).forEach(function (result) {
      var option = document.createElement("option");
      option.value = getSuggestionLabel(result);
      citySuggestions.appendChild(option);
    });
  }

  function shouldLookupHints(query) {
    var parsedQuery = parseCityQuery(query);

    if (!parsedQuery.city) {
      return false;
    }

    if (parsedQuery.country) {
      return parsedQuery.city.length >= 1;
    }

    return parsedQuery.city.length >= 2;
  }

  function lookupCityHints(query) {
    latestHintQuery = query;

    return fetchWithTimeout(createGeocodingUrl(query), 12000)
      .then(function (response) {
        if (!response.ok) {
          throw new Error("City hint lookup failed.");
        }

        return response.json();
      })
      .then(function (payload) {
        var parsedQuery = parseCityQuery(query);
        var rankedResults;
        var filteredResults;

        if (latestHintQuery !== query) {
          return;
        }

        filteredResults = filterHintResults(payload.results || [], parsedQuery);
        rankedResults = filteredResults.slice();
        rankedResults.sort(function (left, right) {
          return scoreCityResult(right, parsedQuery) - scoreCityResult(left, parsedQuery);
        });

        updateSuggestionHints(rankedResults);
      })
      .catch(function () {
        if (latestHintQuery === query) {
          updateSuggestionHints([]);
        }
      });
  }

  function handleCityInput() {
    var query = cityInput.value.trim();

    window.clearTimeout(hintTimer);

    if (!shouldLookupHints(query)) {
      updateSuggestionHints([]);
      return;
    }

    hintTimer = window.setTimeout(function () {
      lookupCityHints(query);
    }, 250);
  }

  function handleCitySubmit(event) {
    var query;
    event.preventDefault();
    query = cityInput.value.trim();

    if (!query) {
      setFormMessage("Type a city name first.");
      return;
    }

    addCityButton.disabled = true;
    setFormMessage('Looking up "' + query + '"...');

    resolveCity(query)
      .then(function (city) {
        cityInput.value = "";
        addCity(city);
      })
      .catch(function (error) {
        console.error(error);
        setFormMessage(error.message || "Unable to add that city right now.");
      })
      .finally(function () {
        addCityButton.disabled = false;
      });
  }

  function init() {
    if (
      !cardsContainer ||
      !tabsContainer ||
      !refreshButton ||
      !statusText ||
      !cityCount ||
      !cityForm ||
      !cityInput ||
      !citySuggestions ||
      !addCityButton ||
      !cityFormMessage ||
      !cityCardTemplate
    ) {
      return;
    }

    updateCityCount();
    saveCities();
    cityForm.addEventListener("submit", handleCitySubmit);
    cityInput.addEventListener("input", handleCityInput);
    refreshButton.addEventListener("click", loadWeather);
    loadWeather();
  }

  window.addEventListener("error", function (event) {
    if (statusText) {
      statusText.textContent = "The page hit a script error while starting.";
    }

    if (cardsContainer) {
      renderError("Startup error: " + event.message);
    }
  });

  init();
})();
