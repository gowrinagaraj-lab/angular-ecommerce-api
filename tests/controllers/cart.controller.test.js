jest.mock("../../src/models/Cart");
jest.mock("../../src/models/Product");
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const { validationResult } = require("express-validator");
const Cart = require("../../src/models/Cart");
const Product = require("../../src/models/Product");
const cartController = require("../../controllers/cart.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

describe("cart.controller", () => {

    beforeEach(() => {
        validationResult.mockReturnValue(validRequest());
    });

    describe("addToCart", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid product"));

            const req = { user: { id: "user-1" }, body: {} };
            const res = mockResponse();

            await cartController.addToCart(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the product does not exist", async () => {

            Product.findById.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, body: { productId: "p1", quantity: 1 } };
            const res = mockResponse();

            await cartController.addToCart(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("creates a new cart when the user has none, and adds the item", async () => {

            Product.findById.mockResolvedValue({ _id: "p1", name: "Widget", stock: 5 });
            Cart.findOne.mockResolvedValue(null);
            const saveSpy = jest.fn().mockResolvedValue(true);
            Cart.mockImplementation(function (data) {
                Object.assign(this, data);
                this.save = saveSpy;
            });

            const req = { user: { id: "user-1" }, body: { productId: "p1", quantity: 2 } };
            const res = mockResponse();

            await cartController.addToCart(req, res);

            expect(saveSpy).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);

        });

        it("rejects when requested quantity exceeds available stock", async () => {

            Product.findById.mockResolvedValue({ _id: "p1", name: "Widget", stock: 1 });
            Cart.findOne.mockResolvedValue({ items: [], save: jest.fn() });

            const req = { user: { id: "user-1" }, body: { productId: "p1", quantity: 5 } };
            const res = mockResponse();

            await cartController.addToCart(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Only 1 unit(s) of Widget available" }));

        });

        it("increments the quantity of an item already in the cart", async () => {

            Product.findById.mockResolvedValue({ _id: "p1", name: "Widget", stock: 10 });
            const cart = {
                items: [{ product: { toString: () => "p1" }, quantity: 2 }],
                save: jest.fn().mockResolvedValue(true)
            };
            Cart.findOne.mockResolvedValue(cart);

            const req = { user: { id: "user-1" }, body: { productId: "p1", quantity: 3 } };
            const res = mockResponse();

            await cartController.addToCart(req, res);

            expect(cart.items[0].quantity).toBe(5);
            expect(cart.save).toHaveBeenCalled();

        });

        it("adds a new line item when the product is not already in the cart", async () => {

            Product.findById.mockResolvedValue({ _id: "p2", name: "Gadget", stock: 10 });
            const cart = { items: [], save: jest.fn().mockResolvedValue(true) };
            Cart.findOne.mockResolvedValue(cart);

            const req = { user: { id: "user-1" }, body: { productId: "p2", quantity: 1 } };
            const res = mockResponse();

            await cartController.addToCart(req, res);

            expect(cart.items).toHaveLength(1);
            expect(cart.items[0]).toEqual({ product: "p2", quantity: 1 });

        });

    });

    describe("getCart", () => {

        it("returns 404 when the user has no cart", async () => {

            Cart.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await cartController.getCart(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("filters deleted products, computes the grand total, and persists the cleanup", async () => {

            const cart = {
                items: [
                    { product: { price: 10 }, quantity: 2 },
                    { product: null, quantity: 1 }
                ],
                save: jest.fn().mockResolvedValue(true)
            };
            Cart.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(cart) });

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await cartController.getCart(req, res);

            expect(cart.items).toHaveLength(1);
            expect(cart.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, totalItems: 1, grandTotal: 20 }));

        });

    });

    describe("updateQuantity", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid product"));

            const req = { user: { id: "user-1" }, body: {} };
            const res = mockResponse();

            await cartController.updateQuantity(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the cart does not exist", async () => {

            Cart.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, body: { productId: "p1", quantity: 2 } };
            const res = mockResponse();

            await cartController.updateQuantity(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("returns 404 when the product is not in the cart", async () => {

            Cart.findOne.mockResolvedValue({ items: [] });

            const req = { user: { id: "user-1" }, body: { productId: "p1", quantity: 2 } };
            const res = mockResponse();

            await cartController.updateQuantity(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Product not found in cart" }));

        });

        it("returns 404 when the product referenced in the cart was deleted", async () => {

            Cart.findOne.mockResolvedValue({ items: [{ product: { toString: () => "p1" }, quantity: 1 }] });
            Product.findById.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, body: { productId: "p1", quantity: 2 } };
            const res = mockResponse();

            await cartController.updateQuantity(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Product not found" }));

        });

        it("rejects when the requested quantity exceeds stock", async () => {

            const item = { product: { toString: () => "p1" }, quantity: 1 };
            Cart.findOne.mockResolvedValue({ items: [item] });
            Product.findById.mockResolvedValue({ _id: "p1", name: "Widget", stock: 2 });

            const req = { user: { id: "user-1" }, body: { productId: "p1", quantity: 5 } };
            const res = mockResponse();

            await cartController.updateQuantity(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("updates the quantity successfully", async () => {

            const item = { product: { toString: () => "p1" }, quantity: 1 };
            const cart = { items: [item], save: jest.fn().mockResolvedValue(true) };
            Cart.findOne.mockResolvedValue(cart);
            Product.findById.mockResolvedValue({ _id: "p1", name: "Widget", stock: 10 });

            const req = { user: { id: "user-1" }, body: { productId: "p1", quantity: 4 } };
            const res = mockResponse();

            await cartController.updateQuantity(req, res);

            expect(item.quantity).toBe(4);
            expect(cart.save).toHaveBeenCalled();

        });

    });

    describe("removeItem", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid product"));

            const req = { user: { id: "user-1" }, params: { productId: "p1" } };
            const res = mockResponse();

            await cartController.removeItem(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the cart does not exist", async () => {

            Cart.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, params: { productId: "p1" } };
            const res = mockResponse();

            await cartController.removeItem(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("removes the item from the cart", async () => {

            const cart = {
                items: [{ product: { toString: () => "p1" } }, { product: { toString: () => "p2" } }],
                save: jest.fn().mockResolvedValue(true)
            };
            Cart.findOne.mockResolvedValue(cart);

            const req = { user: { id: "user-1" }, params: { productId: "p1" } };
            const res = mockResponse();

            await cartController.removeItem(req, res);

            expect(cart.items).toHaveLength(1);
            expect(cart.save).toHaveBeenCalled();

        });

    });

    describe("clearCart", () => {

        it("returns 404 when the cart does not exist", async () => {

            Cart.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await cartController.clearCart(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("clears all items from the cart", async () => {

            const cart = { items: [{ product: "p1" }], save: jest.fn().mockResolvedValue(true) };
            Cart.findOne.mockResolvedValue(cart);

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await cartController.clearCart(req, res);

            expect(cart.items).toHaveLength(0);
            expect(cart.save).toHaveBeenCalled();

        });

    });

});
