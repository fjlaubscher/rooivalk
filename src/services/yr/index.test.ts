import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YR_COORDINATES, YR_USER_AGENT } from '../../constants.ts';
import type { YrResponse } from '../../types.ts';
import YrService from './index.ts';

const mockYrResponse = (overrides: Partial<YrResponse> = {}): YrResponse => ({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [18.42322, -33.92584, 0],
  },
  properties: {
    meta: {
      updated_at: '2024-06-01T00:00:00Z',
      units: {
        air_pressure_at_sea_level: 'hPa',
        air_temperature: 'C',
        cloud_area_fraction: '%',
        precipitation_amount: 'mm',
        relative_humidity: '%',
        wind_from_direction: 'deg',
        wind_speed: 'm/s',
      },
    },
    timeseries: [
      {
        time: new Date().toISOString().split('T')[0] + 'T06:00:00Z',
        data: {
          instant: {
            details: {
              air_pressure_at_sea_level: 1012,
              air_temperature: 15,
              cloud_area_fraction: 30,
              relative_humidity: 60,
              wind_from_direction: 90,
              wind_speed: 5,
            },
          },
          next_1_hours: {
            summary: { symbol_code: 'clearsky_day' },
            details: { precipitation_amount: 0 },
          },
        },
      },
      {
        time: new Date().toISOString().split('T')[0] + 'T12:00:00Z',
        data: {
          instant: {
            details: {
              air_pressure_at_sea_level: 1010,
              air_temperature: 20,
              cloud_area_fraction: 10,
              relative_humidity: 55,
              wind_from_direction: 100,
              wind_speed: 7,
            },
          },
          next_1_hours: {
            summary: { symbol_code: 'partlycloudy_day' },
            details: { precipitation_amount: 0 },
          },
        },
      },
    ],
  },
  ...overrides,
});

describe('YrService', () => {
  let yrService: YrService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    yrService = new YrService();
    fetchSpy = vi.spyOn(global as any, 'fetch');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('parses YrResponse and returns correct WeatherForecast', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockYrResponse(),
    } as Response);

    const forecast = await yrService.getForecastByLocation('LAKESIDE');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('api.met.no'),
      expect.objectContaining({
        headers: { 'User-Agent': YR_USER_AGENT },
      }),
    );
    expect(forecast).not.toBeNull();
    expect(forecast?.location).toBe('LAKESIDE');
    expect(forecast?.friendlyName).toBe(YR_COORDINATES.LAKESIDE.name);
    expect(forecast?.minTemp).toBe(15);
    expect(forecast?.maxTemp).toBe(20);
    expect(forecast?.avgHumidity).toBe(57.5);
    expect(forecast?.avgWindSpeed).toBe(6);
    expect(typeof forecast?.avgWindDirection).toBe('string');
  });

  it('returns null if YrResponse is missing', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => null,
    } as Response);

    const forecast = await yrService.getForecastByLocation('LAKESIDE');
    expect(forecast).toBeNull();
  });

  it('throws error for invalid location', async () => {
    await expect(yrService.getForecastByLocation('INVALID')).rejects.toThrow(
      /Invalid location/,
    );
  });

  it('throws error if fetch fails', async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    const pending = yrService.getForecastByLocation('LAKESIDE');
    const assertion = expect(pending).rejects.toThrow(
      'Failed to fetch weather data for LAKESIDE: 500 Internal Server Error',
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable HTTP error', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    await expect(yrService.getForecastByLocation('TABLEVIEW')).rejects.toThrow(
      'Failed to fetch weather data for TABLEVIEW: 404 Not Found',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 429 when Retry-After is longer than the short wait', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        get: (name: string) => (name === 'retry-after' ? '120' : null),
      },
    } as Response);

    await expect(yrService.getForecastByLocation('BONNIEVALE')).rejects.toThrow(
      'Failed to fetch weather data for BONNIEVALE: 429 Too Many Requests',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx once and returns the forecast when the retry succeeds', async () => {
    vi.useFakeTimers();
    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockYrResponse(),
      } as Response);

    const pending = yrService.getForecastByLocation('TABLEVIEW');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ location: 'TABLEVIEW' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) {
      expect(call[1]).toMatchObject({
        headers: { 'User-Agent': YR_USER_AGENT },
      });
    }
  });

  it('retries a short 429 once', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: (name: string) => (name === 'retry-after' ? '0' : null),
        },
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockYrResponse(),
      } as Response);

    const forecast = await yrService.getForecastByLocation('LAKESIDE');
    expect(forecast?.location).toBe('LAKESIDE');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries a network error once and returns the forecast when it succeeds', async () => {
    vi.useFakeTimers();
    fetchSpy
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockYrResponse(),
      } as Response);

    const pending = yrService.getForecastByLocation('TABLEVIEW');
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ location: 'TABLEVIEW' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('retries a network error once and includes the cause when it still fails', async () => {
    vi.useFakeTimers();
    fetchSpy.mockRejectedValue(new TypeError('network down'));

    const pending = yrService.getForecastByLocation('TABLEVIEW');
    const assertion = expect(pending).rejects.toThrow(
      'Failed to fetch weather data for TABLEVIEW: network down',
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws error if no weather data for today', async () => {
    const response = mockYrResponse({
      properties: {
        ...mockYrResponse().properties,
        timeseries: [],
      },
    });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => response,
    } as Response);

    await expect(yrService.getForecastByLocation('LAKESIDE')).rejects.toThrow(
      /No weather data available for today/,
    );
  });

  it('getAllForecasts returns all available forecasts', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => mockYrResponse(),
      } as Response),
    );

    const forecasts = await yrService.getAllForecasts();
    expect(Array.isArray(forecasts)).toBe(true);
    expect(forecasts.length).toBe(Object.keys(YR_COORDINATES).length);
    forecasts.forEach((forecast) => {
      expect(forecast).not.toBeNull();
      expect(typeof forecast?.location).toBe('string');
    });
  });

  it('getAllForecasts filters out null forecasts', async () => {
    // First location returns null, others return valid
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => null,
      } as Response)
      .mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => mockYrResponse(),
        } as Response),
      );

    const forecasts = await yrService.getAllForecasts();
    expect(forecasts.length).toBe(Object.keys(YR_COORDINATES).length - 1);
  });

  it('getAllForecasts returns the locations that worked and logs the rest', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bonnievaleLat = String(YR_COORDINATES.BONNIEVALE.latitude);
    fetchSpy.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes(`lat=${bonnievaleLat}`)) {
        return Promise.resolve({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockYrResponse(),
      } as Response);
    });

    const forecasts = await yrService.getAllForecasts();
    expect(forecasts).toHaveLength(Object.keys(YR_COORDINATES).length - 1);
    expect(forecasts.map((forecast) => forecast.location)).not.toContain(
      'BONNIEVALE',
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'Weather forecast failed for BONNIEVALE:',
      expect.objectContaining({
        message: expect.stringContaining('403 Forbidden'),
      }),
    );
  });

  it('getAllForecasts returns an empty list when every location fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    } as Response);

    const forecasts = await yrService.getAllForecasts();
    expect(forecasts).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(Object.keys(YR_COORDINATES).length);
  });

  it('convertDegreesToCompass returns correct direction', () => {
    // @ts-expect-private
    // @ts-ignore
    expect(yrService.convertDegreesToCompass(0)).toBe('N');
    // @ts-ignore
    expect(yrService.convertDegreesToCompass(90)).toBe('E');
    // @ts-ignore
    expect(yrService.convertDegreesToCompass(180)).toBe('S');
    // @ts-ignore
    expect(yrService.convertDegreesToCompass(270)).toBe('W');
  });
});
