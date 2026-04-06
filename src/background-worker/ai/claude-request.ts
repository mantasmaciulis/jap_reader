import { getConfiguration } from '@shared/configuration/get-configuration';
import { ConfigurationSchema } from '@shared/configuration/types';

const ALLOWED_PROMPT_KEYS: ReadonlySet<string> = new Set(['aiWordPrompt', 'aiSentencePrompt']);

const getClaudeConfig = async (
  promptKey: string,
): Promise<{ apiKey: string; systemPrompt: string }> => {
  if (!ALLOWED_PROMPT_KEYS.has(promptKey)) {
    throw new Error(`Invalid prompt key: ${promptKey}`);
  }

  const apiKey = await getConfiguration('claudeApiKey');

  if (!apiKey?.length) {
    throw new Error('Claude API key is not set. Set it in the extension settings.');
  }

  const systemPrompt = (await getConfiguration(promptKey as keyof ConfigurationSchema)) as string;

  return { apiKey, systemPrompt };
};

const buildFetchInit = (
  apiKey: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
): RequestInit => ({
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'anthropic-dangerous-direct-browser-access': 'true',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    stream: true,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  }),
});

const handleErrorResponse = async (response: Response): Promise<never> => {
  const error = (await response.json()) as { error?: { message?: string } };
  const message = error?.error?.message || `API error ${response.status}`;

  throw new Error(message);
};

export const claudeStreamRequest = async (
  promptKey: string,
  userContent: string,
  maxTokens: number,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const { apiKey, systemPrompt } = await getClaudeConfig(promptKey);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    ...buildFetchInit(apiKey, systemPrompt, userContent, maxTokens),
    signal,
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');

      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        const data = line.slice(6);

        try {
          const event = JSON.parse(data) as {
            type: string;
            delta?: { type: string; text: string };
          };

          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            onChunk(event.delta.text);
          }
        } catch {
          // Malformed JSON line
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};
