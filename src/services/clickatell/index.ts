const CLICKATELL_HTTP_SEND_URL =
  'https://platform.clickatell.com/messages/http/send';

export type ClickatellSendResult = {
  ok: boolean;
  status: number;
  body: string;
};

class ClickatellService {
  private _apiKey: string | undefined;

  constructor(apiKey?: string) {
    this._apiKey = apiKey;
  }

  public get isConfigured(): boolean {
    return Boolean(this._apiKey);
  }

  public async sendSms(
    to: string,
    content: string,
  ): Promise<ClickatellSendResult> {
    if (!this._apiKey) {
      throw new Error('CLICKATELL_API_KEY is not configured');
    }

    const normalizedTo = to.trim().replace(/^\+/, '').replace(/[\s-]/g, '');
    if (!/^\d{6,15}$/.test(normalizedTo)) {
      throw new Error(
        `Invalid recipient number: ${to}. Use international format (digits only, no +).`,
      );
    }

    const trimmedContent = content?.trim();
    if (!trimmedContent) {
      throw new Error('SMS content cannot be empty');
    }

    const url = new URL(CLICKATELL_HTTP_SEND_URL);
    url.searchParams.set('apiKey', this._apiKey);
    url.searchParams.set('to', normalizedTo);
    url.searchParams.set('content', trimmedContent);

    const response = await fetch(url.toString());
    const body = await response.text();

    if (!response.ok) {
      throw new Error(
        `Clickatell send failed: ${response.status} ${response.statusText} ${body}`,
      );
    }

    return {
      ok: true,
      status: response.status,
      body,
    };
  }
}

export default ClickatellService;
