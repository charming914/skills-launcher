module.exports.runtime = {
  async handler({ skillName = "" }) {
    return `Local seeded skill placeholder for skill-installer received: ${skillName}`;
  },
};
