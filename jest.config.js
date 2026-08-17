module.exports = {
    testEnvironment: "node",
    testMatch: ["**/tests/**/*.test.js"],
    collectCoverageFrom: [
        "controllers/**/*.js",
        "src/middleware/**/*.js",
        "utils/**/*.js"
    ],
    clearMocks: true
};
