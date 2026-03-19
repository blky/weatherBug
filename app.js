(function () {
  var defaultCities = [
    {
      name: "Amsterdam",
      region: "North Holland, Netherlands",
      latitude: 52.3676,
      longitude: 4.9041,
      timezone: "Europe/Amsterdam",
    },
    {
      name: "London",
      region: "England, United Kingdom",
      latitude: 51.5072,
      longitude: -0.1276,
      timezone: "Europe/London",
    },
    {
      name: "Chengdu",
      region: "Sichuan, China",
      latitude: 30.5728,
      longitude: 104.0668,
      timezone: "Asia/Shanghai",
    },
    {
      name: "Union City",
      region: "California, United States",
      latitude: 37.5934,
      longitude: -122.0438,
      timezone: "America/Los_Angeles",
    },
    {
      name: "Los Angeles",
      region: "California, United States",
      latitude: 34.0522,
      longitude: -118.2437,
      timezone: "America/Los_Angeles",
    },
  ];
  var trackedCities = defaultCities.slice();

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
  var expandedCityKey = "";
  var hintTimer = 0;
  var latestHintQuery = "";
  var preferredCityIndex = buildPreferredCityIndex(defaultCities);

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

  function getShouldShowFullDay(cityWeather) {
    return expandedCityKey === cityWeather.cityKey;
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
      weekday: "long",
      timeZone: timezone,
    }).format(date);
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
        "wind_speed_10m",
        "wind_direction_10m",
        "weather_code",
      ].join(","),
      past_days: "2",
      forecast_days: "7",
      timezone: city.timezone,
    });

    return "https://api.open-meteo.com/v1/forecast?" + params.toString();
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
    var rows = payload.hourly.time.map(function (isoTime, index) {
      var temperatureC = payload.hourly.temperature_2m[index];
      var windSpeed = payload.hourly.wind_speed_10m[index];
      var windDirection = payload.hourly.wind_direction_10m[index];
      var windDirectionLabel = getCompassDirection(windDirection);
      var weatherCode = payload.hourly.weather_code[index];
      var dateKey = isoTime.slice(0, 10);
      var row;

      row = {
        dateKey: dateKey,
        isoTime: isoTime,
        hour: formatLocalHour(isoTime),
        temperatureC: temperatureC,
        temperatureF: celsiusToFahrenheit(temperatureC),
        humidity: payload.hourly.relative_humidity_2m[index],
        dewPoint: payload.hourly.dew_point_2m[index],
        rain: payload.hourly.rain[index],
        wind:
          getWindDescriptor(windSpeed) +
          " " +
          windSpeed.toFixed(1) +
          " km/h " +
          getDirectionArrow(windDirectionLabel) +
          " " +
          windDirectionLabel,
        conditionIcon: getWeatherIcon(weatherCode),
        condition: weatherCodeMap[weatherCode] || "Unknown",
      };

      if (!groupedRows[dateKey]) {
        groupedRows[dateKey] = [];
        orderedDateKeys.push(dateKey);
      }

      groupedRows[dateKey].push(row);

      return row;
    });

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
    var dateNav = card.querySelector(".date-nav");
    var dateLabel = card.querySelector(".date-label");
    var viewToggle = card.querySelector(".view-toggle");
    var selectedDateKey = getSelectedDateKey(cityWeather);
    var allRows = cityWeather.rowsByDate[selectedDateKey] || [];
    var isFullDay = getShouldShowFullDay(cityWeather);
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
      "Local time updated " + cityWeather.updatedAt;
    dateLabel.textContent = formatDateLabel(selectedDateKey, cityWeather.timezone);
    viewToggle.textContent = isFullDay ? "Show every 2 hours" : "Show 24 hours";

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
      expandedCityKey = isFullDay ? "" : cityWeather.cityKey;
      renderCityCards(lastRenderedWeatherList);
    });

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
        row.temperatureC.toFixed(1) +
        " C</td>" +
        "<td>" +
        row.temperatureF.toFixed(1) +
        " F</td>" +
        "<td>" +
        row.humidity +
        "%</td>" +
        "<td>" +
        row.dewPoint.toFixed(1) +
        " C</td>" +
        "<td>" +
        row.rain.toFixed(1) +
        " mm</td>" +
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

  var lastRenderedWeatherList = [];

  function renderTabs(cityWeatherList) {
    tabsContainer.innerHTML = "";

    cityWeatherList.forEach(function (cityWeather) {
      var button = document.createElement("button");
      var content = document.createElement("span");
      var label = document.createElement("span");
      var remove = document.createElement("button");
      button.type = "button";
      button.className = "city-tab";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", cityWeather.cityKey === activeCityKey ? "true" : "false");
      button.addEventListener("click", function () {
        activeCityKey = cityWeather.cityKey;
        activeDateKey = cityWeather.currentDateKey;
        if (expandedCityKey && expandedCityKey !== cityWeather.cityKey) {
          expandedCityKey = "";
        }
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

    if (selectedCity) {
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
      expandedCityKey = "";
    }

    updateCityCount();
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

  function loadWeather() {
    refreshButton.disabled = true;
    statusText.textContent = "Refreshing hourly forecast...";

    Promise.all(
      trackedCities.map(function (city) {
        return fetchWithTimeout(createWeatherUrl(city), 12000)
          .then(function (response) {
            if (!response.ok) {
              throw new Error("Weather request failed for " + city.name + ".");
            }

            return response.json();
          })
          .then(function (payload) {
            return normalizeCityData(city, payload);
          });
      }),
    )
      .then(function (responses) {
        renderCityCards(responses);
        statusText.textContent =
          "Showing every-2-hour measurements by default, with optional 24-hour view, across the last 2 days and next 7 days for " +
          trackedCities.length +
          " cities.";
      })
      .catch(function (error) {
        console.error(error);
        renderError(
          "The weather feed could not be loaded. If you opened this as a local file, run the included PowerShell server and open http://localhost:8080 instead.",
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
      expandedCityKey = "";
      setFormMessage(city.name + " is already in the dashboard.");
      loadWeather();
      return;
    }

    trackedCities = trackedCities.concat(city);
    activeCityKey = incomingSlug;
    activeDateKey = "";
    expandedCityKey = "";
    updateCityCount();
    setFormMessage(city.name + " added. Loading weather now.");
    loadWeather();
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
