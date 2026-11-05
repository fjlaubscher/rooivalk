import { YR_COORDINATES, YR_USER_AGENT } from '../../constants.ts';
import type { WeatherForecast, YrResponse } from '../../types.ts';

type ValidLocation = keyof typeof YR_COORDINATES;

// ponytail: one retry; if Retry-After exceeds 2s, fail fast instead of
// blocking the MOTD. A shared backoff queue is the upgrade if the whole
// batch starts getting throttled.
const SHORT_RETRY_MS = 250;
const MAX_RETRY_WAIT_MS = 2_000;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// 5xx and 429 get one short retry. A long Retry-After is honoured by not
// retrying inside this call. Other 4xx (including 403) are not retried.
function retryWaitMs(response: Response): number | null {
  if (response.status >= 500) return SHORT_RETRY_MS;
  if (response.status !== 429) return null;

  const header = response.headers?.get?.('retry-after');
  if (header == null || header === '') return SHORT_RETRY_MS;

  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;

  const wait = seconds * 1000;
  if (wait > MAX_RETRY_WAIT_MS) return null;
  return wait;
}

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

  private async fetchYr(url: string): Promise<Response> {
    const init: RequestInit = {
      headers: { 'User-Agent': YR_USER_AGENT },
    };

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      await sleep(SHORT_RETRY_MS);
      return await fetch(url, init);
    }

    const wait = retryWaitMs(response);
    if (wait === null) return response;
    await sleep(wait);
    return await fetch(url, init);
  }

  public async getForecastByLocation(
    location: ValidLocation,
  ): Promise<WeatherForecast | null> {
    const coordinates = YR_COORDINATES[location];
    if (!coordinates) {
      throw new Error(`Invalid location: ${location}`);
    }

    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${coordinates.latitude}&lon=${coordinates.longitude}`;
    let response: Response;
    try {
      response = await this.fetchYr(url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to fetch weather data for ${location}: ${reason}`,
      );
    }

    if (!response.ok) {
      const status = `${response.status} ${response.statusText}`.trim();
      throw new Error(
        `Failed to fetch weather data for ${location}: ${status}`,
      );
    }

    const data = (await response.json()) as YrResponse;
    return data ? this.parseYrResponse(location, data) : null;
  }

  public async getAllForecasts(): Promise<WeatherForecast[]> {
    const locations = Object.keys(YR_COORDINATES) as ValidLocation[];
    const results = await Promise.allSettled(
      locations.map((location) => this.getForecastByLocation(location)),
    );

    const forecasts: WeatherForecast[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        if (result.value) forecasts.push(result.value);
        continue;
      }
      console.error(
        `Weather forecast failed for ${locations[index]}:`,
        result.reason,
      );
    }
    return forecasts;
  }
}

export default YrService;
