# Hourly Weather Monitor

Simple browser app that shows hourly weather for:

- Amsterdam
- London
- Chengdu
- Union City, California

## Included measurements

- Temperature in Celsius
- Temperature in Fahrenheit
- Humidity
- Dew point
- Rain
- Wind condition

## Run it

Best option: run the included PowerShell server, then open `http://localhost:8080`.

1. Open PowerShell in `C:\codex\weatherBug`
2. Run `.\serve.ps1`
3. Open `http://localhost:8080`

You can still try opening `index.html` directly, but some browsers restrict API requests from `file://` pages.

## Notes

- The dashboard shows the next 24 hourly forecast entries for each city.
- "Unity City in California" was implemented as **Union City, California**, which is likely the intended location name.
