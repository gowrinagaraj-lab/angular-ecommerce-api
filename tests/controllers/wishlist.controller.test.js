jest.mock("../../src/models/Wishlist");
jest.mock("../../src/models/Product");
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const { validationResult } = require("express-validator");
const Wishlist = require("../../src/models/Wishlist");
const Product = require("../../src/models/Product");
const wishlistController = require("../../controllers/wishlist.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

describe("wishlist.controller", () => {

    beforeEach(() => {
        validationResult.mockReturnValue(validRequest());
    });

    describe("getWishlist", () => {

        it("returns an empty list when the user has no wishlist yet", async () => {

            Wishlist.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await wishlistController.getWishlist(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 0, data: [] }));

        });

        it("filters out deleted products and persists the cleanup", async () => {

            const wishlist = { products: [{ _id: "p1" }, null], save: jest.fn().mockResolvedValue(true) };
            Wishlist.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(wishlist) });

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await wishlistController.getWishlist(req, res);

            expect(wishlist.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 1 }));

        });

        it("does not re-save when nothing was filtered out", async () => {

            const wishlist = { products: [{ _id: "p1" }], save: jest.fn().mockResolvedValue(true) };
            Wishlist.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(wishlist) });

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await wishlistController.getWishlist(req, res);

            expect(wishlist.save).not.toHaveBeenCalled();

        });

        it("returns 500 on unexpected errors", async () => {

            Wishlist.findOne.mockReturnValue({ populate: jest.fn().mockRejectedValue(new Error("DB down")) });

            const res = mockResponse();

            await wishlistController.getWishlist({ user: { id: "user-1" } }, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("addToWishlist", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid product"));

            const req = { user: { id: "user-1" }, body: {} };
            const res = mockResponse();

            await wishlistController.addToWishlist(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the product does not exist", async () => {

            Product.findById.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, body: { productId: "p1" } };
            const res = mockResponse();

            await wishlistController.addToWishlist(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("creates a new wishlist and adds the product when none exists yet", async () => {

            Product.findById.mockResolvedValue({ _id: "p1" });
            Wishlist.findOne.mockResolvedValue(null);
            const saveSpy = jest.fn().mockResolvedValue(true);
            Wishlist.mockImplementation(function (data) {
                Object.assign(this, data);
                this.save = saveSpy;
            });

            const req = { user: { id: "user-1" }, body: { productId: "p1" } };
            const res = mockResponse();

            await wishlistController.addToWishlist(req, res);

            expect(saveSpy).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);

        });

        it("rejects duplicate products", async () => {

            Product.findById.mockResolvedValue({ _id: "p1" });
            Wishlist.findOne.mockResolvedValue({ products: [{ toString: () => "p1" }], save: jest.fn() });

            const req = { user: { id: "user-1" }, body: { productId: "p1" } };
            const res = mockResponse();

            await wishlistController.addToWishlist(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Product already in wishlist" }));

        });

        it("adds the product to an existing wishlist", async () => {

            Product.findById.mockResolvedValue({ _id: "p2" });
            const wishlist = { products: [], save: jest.fn().mockResolvedValue(true) };
            Wishlist.findOne.mockResolvedValue(wishlist);

            const req = { user: { id: "user-1" }, body: { productId: "p2" } };
            const res = mockResponse();

            await wishlistController.addToWishlist(req, res);

            expect(wishlist.products).toContain("p2");
            expect(wishlist.save).toHaveBeenCalled();

        });

    });

    describe("removeFromWishlist", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid product"));

            const req = { user: { id: "user-1" }, params: { productId: "p1" } };
            const res = mockResponse();

            await wishlistController.removeFromWishlist(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the wishlist does not exist", async () => {

            Wishlist.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, params: { productId: "p1" } };
            const res = mockResponse();

            await wishlistController.removeFromWishlist(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("removes the product from the wishlist", async () => {

            const wishlist = { products: [{ toString: () => "p1" }, { toString: () => "p2" }], save: jest.fn().mockResolvedValue(true) };
            Wishlist.findOne.mockResolvedValue(wishlist);

            const req = { user: { id: "user-1" }, params: { productId: "p1" } };
            const res = mockResponse();

            await wishlistController.removeFromWishlist(req, res);

            expect(wishlist.products).toHaveLength(1);
            expect(wishlist.save).toHaveBeenCalled();

        });

    });

    describe("clearWishlist", () => {

        it("returns 404 when the wishlist does not exist", async () => {

            Wishlist.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await wishlistController.clearWishlist(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("clears all products from the wishlist", async () => {

            const wishlist = { products: [{ _id: "p1" }], save: jest.fn().mockResolvedValue(true) };
            Wishlist.findOne.mockResolvedValue(wishlist);

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await wishlistController.clearWishlist(req, res);

            expect(wishlist.products).toHaveLength(0);
            expect(wishlist.save).toHaveBeenCalled();

        });

    });

});
