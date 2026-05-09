// Model configuration for all AI calls in the pipeline.
// Change model here to switch all stages to a different model.
const config = {
  // DeepSeek models: 'deepseek-chat' (V3) or 'deepseek-reasoner' (R1)
  model: 'deepseek-reasoner',
  // Base temperature for structured extraction
  temperature: 0.3,
  // Max tokens for extraction per conversation
  extractionMaxTokens: 2048,
  // Max tokens for digest generation
  digestMaxTokens: 8192,
  // Max tokens for synthesis generation
  synthesisMaxTokens: 4096,
};

export default config;
