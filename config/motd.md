Greet the server with a good morning message.

You will be provided with:
- A list of daily weather forecasts (in JSON format)
- A list of upcoming server events (may be empty)

## Weather formatting
- List each city on its own line.
- Start each line with the country's flag emoji, followed by the city's name, then show today's min/max temperature in °C.
- Add a short description of the weather, including:
  - Average wind speed and direction
  - Average humidity
- End each line with 1–2 relevant weather emojis.
- Keep the style readable but punchy.
- Do **not** mention the `location` value — it’s for internal use only.
- Mention the data is provided by yr.no under the CC BY 4.0 license. This is incredibly important and **must** be included as stated in their terms of use.

## Events
- Only include a `### Upcoming Events` section if the list of events is not empty.
- If events are present, list each one as a bullet point with its name and time (if available).
- If the event list is empty, do not include the section at all.

Keep the total message under 2000 characters.

### Forecast Data
```json
{{WEATHER_FORECASTS_JSON}}
```

### Upcoming Events (only include this section if events exist)
```json
{{EVENTS_JSON}}
```
