/**
 * WhatsApp service wrapper for Evolution API v2.3.7
 *
 * ALERTS-01: Evolution API v2.3.7 hard-pinned (Docker tag)
 * ALERTS-03: Never call directly from webhook — always via BullMQ alert-worker
 *
 * Does NOT throw — callers must handle WhatsAppSendResult.success === false
 */

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Normalizes phone number to Evolution API format.
 * Strips leading "+" — Evolution API expects digits only with country code.
 * Examples: "+5511999999999" → "5511999999999", "5511999999999" → "5511999999999"
 */
export function normalizePhone(telefone: string): string {
  return telefone.replace(/^\+/, '');
}

/**
 * Sends a WhatsApp text message via Evolution API.
 *
 * @param telefone - Phone number in E.164 format ("+5511999999999")
 * @param mensagem - Plain text message body
 */
export async function sendAlertaWhatsApp(
  telefone: string,
  mensagem: string,
): Promise<WhatsAppSendResult> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME ?? 'cargo-sentinel';

  if (!apiUrl) {
    return { success: false, error: 'EVOLUTION_API_URL not configured' };
  }

  if (!apiKey) {
    return { success: false, error: 'EVOLUTION_API_KEY not configured' };
  }

  const normalizedPhone = normalizePhone(telefone);
  const endpoint = `${apiUrl}/message/sendText/${instanceName}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: mensagem,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        success: false,
        error: `Evolution API returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as { key?: { id?: string } };
    return {
      success: true,
      messageId: data?.key?.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Network error: ${message}` };
  }
}
