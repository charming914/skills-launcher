module.exports.runtime = {
  execute: async function ({ input = "" }) {
    return {
      success: true,
      output: `Example local skill received: ${input}`,
    };
  },
};
