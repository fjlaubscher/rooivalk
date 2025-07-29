import type { WeatherLocation, WeatherForecast, YrResponse } from '@/types';

const USER_AGENT = 'rooivalk github.com/fjlaubscher/rooivalk';

export const LOCATIONS = {
  CAPE_TOWN: 'Cape Town, South Africa',
  DUBAI: 'Dubai, United Arab Emirates',
  TAMARIN: 'Tamarin, Mauritius',
};

const COORDINATES: Record<keyof typeof LOCATIONS, WeatherLocation> = {
  CAPE_TOWN: {
    latitude: -33.92584,
    longitude: 18.42322,
  },
  DUBAI: {
    latitude: 25.26472,
    longitude: 55.29241,
  },
  TAMARIN: {
    latitude: -20.32922,
    longitude: 57.37768,
  },
};

class YrService {
  private convertDegreesToCompass(degrees: number): string {
    const directions = [
      'N',
      'NNE',
      'NE',
      'ENE',
      'E',
      'ESE',
      'SE',
      'SSE',
      'S',
      'SSW',
      'SW',
      'WSW',
      'W',
      'WNW',
      'NW',
      'NNW',
    ];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index] ?? 'Unknown';
  }

  private parseYrResponse(
    location: keyof typeof LOCATIONS,
    response: YrResponse
  ): WeatherForecast {
    const todayIso = new Date().toISOString().split('T')[0];

    const today = response.properties.timeseries.filter((entry) =>
      entry.time.startsWith(todayIso!)
    );

    if (today.length === 0) {
      throw new Error('No weather data available for today.');
    }

    const temps = today.map((r) => r.data.instant.details.air_temperature);
    const windSpeeds = today.map((r) => r.data.instant.details.wind_speed);
    const humidities = today.map(
      (r) => r.data.instant.details.relative_humidity
    );
    const windDirs = today.map(
      (r) => r.data.instant.details.wind_from_direction
    );

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      location,
      friendlyName: LOCATIONS[location],
      minTemp: Math.min(...temps),
      maxTemp: Math.max(...temps),
      avgWindSpeed: avg(windSpeeds),
      avgWindDirection: this.convertDegreesToCompass(avg(windDirs)),
      avgHumidity: avg(humidities),
    };
  }

  public async getForecastByLocation(
    location: keyof typeof LOCATIONS
  ): Promise<WeatherForecast | null> {
    const coordinates = COORDINATES[location];
    if (!coordinates) {
      throw new Error(`Invalid location: ${location}`);
    }

    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${coordinates.latitude}&lon=${coordinates.longitude}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch weather data for ${location}`);
    }

    const data = (await response.json()) as YrResponse;
    return data ? this.parseYrResponse(location, data) : null;
  }

  public async getAllForecasts() {
    const forecasts = await Promise.all(
      Object.keys(COORDINATES).map((key) =>
        this.getForecastByLocation(key as keyof typeof COORDINATES)
      )
    );

    return forecasts.filter((forecast) => forecast !== null);
  }
}

export default YrService;
