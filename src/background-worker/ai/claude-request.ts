import { getConfiguration } from '@shared/configuration/get-configuration';
import { ConfigurationSchema } from '@shared/configuration/types';

export const claudeRequest = async (
  promptKey: keyof ConfigurationSchema,
  userContent: string,
  maxTokens: number,
): Promise<string> => {
  const apiKey = await getConfiguration('claudeApiKey');

  if (!apiKey?.length) {
    throw new Error('Claude API key is not set. Set it in the extension settings.');
  }

  const systemPrompt = await getConfiguration(promptKey);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: { message?: string } };
    const message = error?.error?.message || `API error ${response.status}`;

    throw new Error(message);
  }

  const result = (await response.json()) as {
    content: { type: string; text: string }[];
  };

  const text = result.content.find((c) => c.type === 'text')?.text;

  if (!text) {
    throw new Error('No text in response');
  }

  return text;
};
