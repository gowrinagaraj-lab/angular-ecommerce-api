jest.mock("../../src/models/Product");
jest.mock("../../src/models/Category");

const mongoose = require("mongoose");
const Product = require("../../src/models/Product");
const Category = require("../../src/models/Category");
const productController = require("../../controllers/product.controller");
const { mockResponse } = require("../helpers/mockRes");

describe("product.controller", () => {

    describe("createProduct", () => {

        it("rejects a duplicate product name (case-insensitive)", async () => {

            Product.findOne.mockResolvedValue({ _id: "p1", name: "Widget" });

            const req = { body: { name: "widget" } };
            const res = mockResponse();

            await productController.createProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(Product.create).not.toHaveBeenCalled();

        });

        it("rejects a malformed category id", async () => {

            Product.findOne.mockResolvedValue(null);

            const req = { body: { name: "Widget", category: "not-an-id" } };
            const res = mockResponse();

            await productController.createProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid category ID format" }));

        });

        it("rejects when the referenced category does not exist", async () => {

            Product.findOne.mockResolvedValue(null);
            const validId = new mongoose.Types.ObjectId().toString();
            Category.findById.mockResolvedValue(null);

            const req = { body: { name: "Widget", category: validId } };
            const res = mockResponse();

            await productController.createProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Category not found" }));

        });

        it("creates the product successfully", async () => {

            Product.findOne.mockResolvedValue(null);
            const validId = new mongoose.Types.ObjectId().toString();
            Category.findById.mockResolvedValue({ _id: validId });
            Product.create.mockResolvedValue({ _id: "p1", name: "Widget", category: validId });

            const req = { body: { name: "Widget", category: validId } };
            const res = mockResponse();

            await productController.createProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(201);

        });

        it("maps a duplicate-key DB error to 400", async () => {

            Product.findOne.mockResolvedValue(null);
            const error = new Error("duplicate key");
            error.code = 11000;
            error.keyValue = { name: "Widget" };
            Product.create.mockRejectedValue(error);

            const req = { body: { name: "Widget" } };
            const res = mockResponse();

            await productController.createProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 500 on unexpected errors", async () => {

            Product.findOne.mockRejectedValue(new Error("DB down"));

            const req = { body: { name: "Widget" } };
            const res = mockResponse();

            await productController.createProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("getProducts", () => {

        const chainable = (result) => ({
            populate: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue(result)
        });

        it("returns a paginated, unfiltered product list by default", async () => {

            const products = [{ name: "Widget" }];
            Product.countDocuments.mockResolvedValue(1);
            Product.find.mockReturnValue(chainable(products));

            const req = { query: {} };
            const res = mockResponse();

            await productController.getProducts(req, res);

            expect(Product.find).toHaveBeenCalledWith({});
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, total: 1, page: 1, data: products }));

        });

        it("applies a case-insensitive name search filter", async () => {

            Product.countDocuments.mockResolvedValue(0);
            Product.find.mockReturnValue(chainable([]));

            const req = { query: { search: "wid" } };
            const res = mockResponse();

            await productController.getProducts(req, res);

            expect(Product.find).toHaveBeenCalledWith({ name: { $regex: "wid", $options: "i" } });

        });

        it("filters by category id when a valid ObjectId is given", async () => {

            const validId = new mongoose.Types.ObjectId().toString();
            Product.countDocuments.mockResolvedValue(0);
            Product.find.mockReturnValue(chainable([]));

            const req = { query: { category: validId } };
            const res = mockResponse();

            await productController.getProducts(req, res);

            expect(Product.find).toHaveBeenCalledWith({ category: validId });

        });

        it("resolves a category name to its id when not a valid ObjectId", async () => {

            const validId = new mongoose.Types.ObjectId().toString();
            Category.findOne.mockResolvedValue({ _id: validId });
            Product.countDocuments.mockResolvedValue(0);
            Product.find.mockReturnValue(chainable([]));

            const req = { query: { category: "Electronics" } };
            const res = mockResponse();

            await productController.getProducts(req, res);

            expect(Product.find).toHaveBeenCalledWith({ category: validId });

        });

        it("short-circuits to an empty result when the category name has no match", async () => {

            Category.findOne.mockResolvedValue(null);

            const req = { query: { category: "Nonexistent" } };
            const res = mockResponse();

            await productController.getProducts(req, res);

            expect(Product.find).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, total: 0, data: [] }));

        });

        it("returns 500 on unexpected errors", async () => {

            Product.countDocuments.mockRejectedValue(new Error("DB down"));

            const req = { query: {} };
            const res = mockResponse();

            await productController.getProducts(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("getProductById", () => {

        it("returns 404 when the product does not exist", async () => {

            Product.findById.mockResolvedValue(null);

            const req = { params: { id: "p1" } };
            const res = mockResponse();

            await productController.getProductById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("returns the product when found", async () => {

            const product = { _id: "p1", name: "Widget" };
            Product.findById.mockResolvedValue(product);

            const req = { params: { id: "p1" } };
            const res = mockResponse();

            await productController.getProductById(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: product }));

        });

        it("returns 400 for a malformed ObjectId", async () => {

            const error = new Error("Cast to ObjectId failed");
            error.kind = "ObjectId";
            Product.findById.mockRejectedValue(error);

            const req = { params: { id: "not-an-id" } };
            const res = mockResponse();

            await productController.getProductById(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

    });

    describe("updateProduct", () => {

        it("rejects when another product already has the requested name", async () => {

            Product.findOne.mockResolvedValue({ _id: "other-product" });

            const req = { params: { id: "p1" }, body: { name: "Widget" } };
            const res = mockResponse();

            await productController.updateProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();

        });

        it("returns 404 when the product does not exist", async () => {

            Product.findOne.mockResolvedValue(null);
            Product.findByIdAndUpdate.mockResolvedValue(null);

            const req = { params: { id: "p1" }, body: { name: "Widget" } };
            const res = mockResponse();

            await productController.updateProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("updates the product successfully", async () => {

            Product.findOne.mockResolvedValue(null);
            const updated = { _id: "p1", name: "Widget" };
            Product.findByIdAndUpdate.mockResolvedValue(updated);

            const req = { params: { id: "p1" }, body: { name: "Widget" } };
            const res = mockResponse();

            await productController.updateProduct(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));

        });

        it("maps a duplicate-key DB error to 400", async () => {

            Product.findOne.mockResolvedValue(null);
            const error = new Error("duplicate key");
            error.code = 11000;
            error.keyValue = { name: "Widget" };
            Product.findByIdAndUpdate.mockRejectedValue(error);

            const req = { params: { id: "p1" }, body: { name: "Widget" } };
            const res = mockResponse();

            await productController.updateProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

    });

    describe("deleteProduct", () => {

        it("returns 404 when the product does not exist", async () => {

            Product.findByIdAndDelete.mockResolvedValue(null);

            const req = { params: { id: "p1" } };
            const res = mockResponse();

            await productController.deleteProduct(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("deletes the product successfully", async () => {

            Product.findByIdAndDelete.mockResolvedValue({ _id: "p1" });

            const req = { params: { id: "p1" } };
            const res = mockResponse();

            await productController.deleteProduct(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        });

    });

});
