import { YR_COORDINATES, YR_USER_AGENT } from '@/constants';
import type { WeatherForecast, YrResponse } from '@/types';

type ValidLocation = keyof typeof YR_COORDINATES;

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
    location: ValidLocation,
    response: YrResponse,
  ): WeatherForecast {
    const todayIso = new Date().toISOString().split('T')[0];

    const today = response.properties.timeseries.filter((entry) =>
      entry.time.startsWith(todayIso!),
    );

    if (today.length === 0) {
      throw new Error('No weather data available for today.');
    }

    const temps = today.map((r) => r.data.instant.details.air_temperature);
    const windSpeeds = today.map((r) => r.data.instant.details.wind_speed);
    const humidities = today.map(
      (r) => r.data.instant.details.relative_humidity,
    );
    const windDirs = today.map(
      (r) => r.data.instant.details.wind_from_direction,
    );
    const totalPrecipitation = today.reduce(
      (acc, curr) =>
        acc + (curr.data.next_1_hours?.details?.precipitation_amount ?? 0),
      0,
    );

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      location: location as string,
      friendlyName: YR_COORDINATES[location].name,
      minTemp: Math.min(...temps),
      maxTemp: Math.max(...temps),
      avgWindSpeed: avg(windSpeeds),
      avgWindDirection: this.convertDegreesToCompass(avg(windDirs)),
      avgHumidity: avg(humidities),
      totalPrecipitation,
    };
  }

  public async getForecastByLocation(
    location: ValidLocation,
  ): Promise<WeatherForecast | null> {
    const coordinates = YR_COORDINATES[location];
    if (!coordinates) {
      throw new Error(`Invalid location: ${location}`);
    }

    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${coordinates.latitude}&lon=${coordinates.longitude}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': YR_USER_AGENT,
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
      Object.keys(YR_COORDINATES).map((key) =>
        this.getForecastByLocation(key as keyof typeof YR_COORDINATES),
      ),
    );

    return forecasts.filter((forecast) => forecast !== null);
  }
}

export default YrService;
