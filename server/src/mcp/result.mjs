// Keep screen/trace data in one canonical payload. Text is a short status, not
// another JSON copy; this connector's clients consume structuredContent.
export function resultText(payload) {
  if (!payload.ok) return `${payload.error.code}: ${payload.error.message}`;
  const data = payload.data ?? {};
  const messages = ['OK. Full result in structuredContent.'];
  if (data.observation_error) messages.push(`Observation failed (${data.observation_error.code}): ${data.observation_error.message}. Action acknowledged; read again, do not repeat it.`);
  if (data.benchmark_warning) messages.push(data.benchmark_warning);
  return messages.join(' ');
}

export const result = payload => ({
  content: [{ type: 'text', text: resultText(payload) }],
  structuredContent: payload,
  ...(!payload.ok ? { isError: true } : {})
});
