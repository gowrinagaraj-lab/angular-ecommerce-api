const { containsBlockedContent } = require("../../utils/contentFilter");

describe("contentFilter", () => {

    describe("containsBlockedContent", () => {

        it("returns false for clean text", () => {
            expect(containsBlockedContent("Great product, works as expected!")).toBe(false);
        });

        it("returns false for an empty or missing comment", () => {
            expect(containsBlockedContent("")).toBe(false);
            expect(containsBlockedContent(undefined)).toBe(false);
        });

        it("flags a blocked word as a whole word, case-insensitively", () => {
            expect(containsBlockedContent("this is Shit")).toBe(true);
        });

        it("does not flag a blocked word that's only a substring of another word", () => {
            expect(containsBlockedContent("I bought a dickey bow tie")).toBe(false);
        });

    });

});
