module.exports.runtime = {
  async handler({ question = "" }) {
    return `Local seeded skill placeholder for openai-docs received: ${question}`;
  },
};
