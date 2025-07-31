import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YR_COORDINATES } from '@/constants';
import type { YrResponse, WeatherForecast } from '@/types';
import YrService from './index';

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
    vi.restoreAllMocks();
  });

  it('parses YrResponse and returns correct WeatherForecast', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockYrResponse(),
    } as Response);

    const forecast = await yrService.getForecastByLocation('CAPE_TOWN');
    expect(forecast).not.toBeNull();
    expect(forecast?.location).toBe('CAPE_TOWN');
    expect(forecast?.friendlyName).toBe(YR_COORDINATES.CAPE_TOWN.name);
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

    const forecast = await yrService.getForecastByLocation('CAPE_TOWN');
    expect(forecast).toBeNull();
  });

  it('throws error for invalid location', async () => {
    await expect(yrService.getForecastByLocation('INVALID')).rejects.toThrow(
      /Invalid location/
    );
  });

  it('throws error if fetch fails', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(yrService.getForecastByLocation('CAPE_TOWN')).rejects.toThrow(
      /Failed to fetch weather data/
    );
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

    await expect(yrService.getForecastByLocation('CAPE_TOWN')).rejects.toThrow(
      /No weather data available for today/
    );
  });

  it('getAllForecasts returns all available forecasts', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => mockYrResponse(),
      } as Response)
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
        } as Response)
      );

    const forecasts = await yrService.getAllForecasts();
    expect(forecasts.length).toBe(Object.keys(YR_COORDINATES).length - 1);
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
