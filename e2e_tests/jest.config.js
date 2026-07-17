module.exports = {
  reporters: [
    "default",
    "<rootDir>/influxReporter.js"
  ],
  testEnvironment: "node",
  testTimeout: 60000,
};
