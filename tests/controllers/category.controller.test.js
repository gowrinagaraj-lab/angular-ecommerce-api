jest.mock("../../src/models/Category");
jest.mock("../../src/models/Product");

const Category = require("../../src/models/Category");
const Product = require("../../src/models/Product");
const categoryController = require("../../controllers/category.controller");
const { mockResponse } = require("../helpers/mockRes");

describe("category.controller", () => {

    describe("createCategory", () => {

        it("rejects a duplicate category name (case-insensitive)", async () => {

            Category.findOne.mockResolvedValue({ _id: "cat-1", name: "Electronics" });

            const req = { body: { name: "electronics" } };
            const res = mockResponse();

            await categoryController.createCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(Category.create).not.toHaveBeenCalled();

        });

        it("creates a category successfully", async () => {

            Category.findOne.mockResolvedValue(null);
            Category.create.mockResolvedValue({ _id: "cat-1", name: "Electronics" });

            const req = { body: { name: "Electronics" } };
            const res = mockResponse();

            await categoryController.createCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        });

        it("maps a duplicate-key DB error to a 400", async () => {

            Category.findOne.mockResolvedValue(null);
            const error = new Error("duplicate key");
            error.code = 11000;
            error.keyValue = { name: "Electronics" };
            Category.create.mockRejectedValue(error);

            const req = { body: { name: "Electronics" } };
            const res = mockResponse();

            await categoryController.createCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 500 on unexpected errors", async () => {

            Category.findOne.mockRejectedValue(new Error("DB down"));

            const req = { body: { name: "Electronics" } };
            const res = mockResponse();

            await categoryController.createCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("getCategories", () => {

        it("returns all categories sorted by name", async () => {

            const categories = [{ name: "A" }, { name: "B" }];
            Category.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(categories) });

            const req = {};
            const res = mockResponse();

            await categoryController.getCategories(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, total: 2, data: categories }));

        });

        it("returns 500 on unexpected errors", async () => {

            Category.find.mockReturnValue({ sort: jest.fn().mockRejectedValue(new Error("DB down")) });

            const res = mockResponse();

            await categoryController.getCategories({}, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("getCategoryById", () => {

        it("returns 404 when the category does not exist", async () => {

            Category.findById.mockResolvedValue(null);

            const req = { params: { id: "cat-1" } };
            const res = mockResponse();

            await categoryController.getCategoryById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("returns the category when found", async () => {

            const category = { _id: "cat-1", name: "Electronics" };
            Category.findById.mockResolvedValue(category);

            const req = { params: { id: "cat-1" } };
            const res = mockResponse();

            await categoryController.getCategoryById(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: category }));

        });

        it("returns 400 for a malformed ObjectId", async () => {

            const error = new Error("Cast to ObjectId failed");
            error.kind = "ObjectId";
            Category.findById.mockRejectedValue(error);

            const req = { params: { id: "not-an-id" } };
            const res = mockResponse();

            await categoryController.getCategoryById(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

    });

    describe("updateCategory", () => {

        it("rejects when another category already has the requested name", async () => {

            Category.findOne.mockResolvedValue({ _id: "other-cat" });

            const req = { params: { id: "cat-1" }, body: { name: "Electronics" } };
            const res = mockResponse();

            await categoryController.updateCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(Category.findByIdAndUpdate).not.toHaveBeenCalled();

        });

        it("returns 404 when the category does not exist", async () => {

            Category.findOne.mockResolvedValue(null);
            Category.findByIdAndUpdate.mockResolvedValue(null);

            const req = { params: { id: "cat-1" }, body: { name: "Electronics" } };
            const res = mockResponse();

            await categoryController.updateCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("updates the category successfully", async () => {

            Category.findOne.mockResolvedValue(null);
            const updated = { _id: "cat-1", name: "Electronics" };
            Category.findByIdAndUpdate.mockResolvedValue(updated);

            const req = { params: { id: "cat-1" }, body: { name: "Electronics" } };
            const res = mockResponse();

            await categoryController.updateCategory(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));

        });

    });

    describe("toggleCategoryStatus", () => {

        it("rejects a non-boolean isActive value", async () => {

            const req = { params: { id: "cat-1" }, body: { isActive: "yes" } };
            const res = mockResponse();

            await categoryController.toggleCategoryStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(Category.findByIdAndUpdate).not.toHaveBeenCalled();

        });

        it("returns 404 when the category does not exist", async () => {

            Category.findByIdAndUpdate.mockResolvedValue(null);

            const req = { params: { id: "cat-1" }, body: { isActive: false } };
            const res = mockResponse();

            await categoryController.toggleCategoryStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("toggles the status successfully", async () => {

            const updated = { _id: "cat-1", isActive: false };
            Category.findByIdAndUpdate.mockResolvedValue(updated);

            const req = { params: { id: "cat-1" }, body: { isActive: false } };
            const res = mockResponse();

            await categoryController.toggleCategoryStatus(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));

        });

    });

    describe("deleteCategory", () => {

        it("returns 404 when the category does not exist", async () => {

            Category.findByIdAndDelete.mockResolvedValue(null);

            const req = { params: { id: "cat-1" } };
            const res = mockResponse();

            await categoryController.deleteCategory(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("deletes the category successfully", async () => {

            Category.findByIdAndDelete.mockResolvedValue({ _id: "cat-1" });

            const req = { params: { id: "cat-1" } };
            const res = mockResponse();

            await categoryController.deleteCategory(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        });

    });

describe("deleteAllCategories", () => {

        it("refuses to run without the confirmation phrase", async () => {

            const res = mockResponse();

            await categoryController.deleteAllCategories({ body: {} }, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(Category.deleteMany).not.toHaveBeenCalled();

        });

        it("deletes only categories that no product uses and reports the rest", async () => {

            Product.distinct.mockResolvedValue(["cat-used"]);
            Category.deleteMany.mockResolvedValue({ deletedCount: 3 });
            Category.countDocuments.mockResolvedValue(1);

            const res = mockResponse();

            await categoryController.deleteAllCategories({ body: { confirm: "DELETE ALL" } }, res);

            expect(Category.deleteMany).toHaveBeenCalledWith({ _id: { $nin: ["cat-used"] } });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                data: { deletedCount: 3, skippedCount: 1 }
            }));

        });

        it("returns 500 on unexpected errors", async () => {

            Product.distinct.mockRejectedValue(new Error("DB down"));

            const res = mockResponse();

            await categoryController.deleteAllCategories({ body: { confirm: "DELETE ALL" } }, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

});

