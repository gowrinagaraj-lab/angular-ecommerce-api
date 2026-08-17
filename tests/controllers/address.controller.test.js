jest.mock("../../src/models/Address");
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const { validationResult } = require("express-validator");
const Address = require("../../src/models/Address");
const addressController = require("../../controllers/address.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

describe("address.controller", () => {

    beforeEach(() => {
        validationResult.mockReturnValue(validRequest());
    });

    describe("getAddresses", () => {

        it("returns the user's addresses sorted by default-first, newest-first", async () => {

            const addresses = [{ isDefault: true }];
            Address.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(addresses) });

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await addressController.getAddresses(req, res);

            expect(Address.find).toHaveBeenCalledWith({ user: "user-1" });
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, count: 1, data: addresses }));

        });

        it("returns 500 on unexpected errors", async () => {

            Address.find.mockReturnValue({ sort: jest.fn().mockRejectedValue(new Error("DB down")) });

            const res = mockResponse();

            await addressController.getAddresses({ user: { id: "user-1" } }, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("addAddress", () => {

        const baseBody = { fullName: "Jane", phone: "123", address: "Street 1", city: "City", state: "State", country: "Country", pincode: "12345" };

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid address"));

            const req = { user: { id: "user-1" }, body: baseBody };
            const res = mockResponse();

            await addressController.addAddress(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(Address.create).not.toHaveBeenCalled();

        });

        it("makes the first address for a user the default automatically", async () => {

            Address.countDocuments.mockResolvedValue(0);
            Address.create.mockResolvedValue({ ...baseBody, isDefault: true });

            const req = { user: { id: "user-1" }, body: baseBody };
            const res = mockResponse();

            await addressController.addAddress(req, res);

            expect(Address.updateMany).toHaveBeenCalledWith({ user: "user-1" }, { isDefault: false });
            expect(Address.create).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true }));
            expect(res.status).toHaveBeenCalledWith(201);

        });

        it("does not default a second address unless isDefault is explicitly true", async () => {

            Address.countDocuments.mockResolvedValue(1);
            Address.create.mockResolvedValue({ ...baseBody, isDefault: false });

            const req = { user: { id: "user-1" }, body: baseBody };
            const res = mockResponse();

            await addressController.addAddress(req, res);

            expect(Address.updateMany).not.toHaveBeenCalled();
            expect(Address.create).toHaveBeenCalledWith(expect.objectContaining({ isDefault: false }));

        });

        it("honors an explicit isDefault: true even when other addresses exist", async () => {

            Address.countDocuments.mockResolvedValue(2);
            Address.create.mockResolvedValue({ ...baseBody, isDefault: true });

            const req = { user: { id: "user-1" }, body: { ...baseBody, isDefault: true } };
            const res = mockResponse();

            await addressController.addAddress(req, res);

            expect(Address.updateMany).toHaveBeenCalledWith({ user: "user-1" }, { isDefault: false });

        });

        it("returns 500 on unexpected errors", async () => {

            Address.countDocuments.mockRejectedValue(new Error("DB down"));

            const req = { user: { id: "user-1" }, body: baseBody };
            const res = mockResponse();

            await addressController.addAddress(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("updateAddress", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid address"));

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" }, body: {} };
            const res = mockResponse();

            await addressController.updateAddress(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the address does not belong to the user", async () => {

            Address.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" }, body: { fullName: "New Name" } };
            const res = mockResponse();

            await addressController.updateAddress(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("updates only the provided fields", async () => {

            const existingAddress = {
                fullName: "Old Name",
                phone: "000",
                isDefault: false,
                save: jest.fn().mockResolvedValue(true)
            };
            Address.findOne.mockResolvedValue(existingAddress);

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" }, body: { fullName: "New Name" } };
            const res = mockResponse();

            await addressController.updateAddress(req, res);

            expect(existingAddress.fullName).toBe("New Name");
            expect(existingAddress.phone).toBe("000");
            expect(existingAddress.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);

        });

        it("clears other defaults and promotes this address when isDefault: true", async () => {

            const existingAddress = { isDefault: false, save: jest.fn().mockResolvedValue(true) };
            Address.findOne.mockResolvedValue(existingAddress);

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" }, body: { isDefault: true } };
            const res = mockResponse();

            await addressController.updateAddress(req, res);

            expect(Address.updateMany).toHaveBeenCalledWith({ user: "user-1" }, { isDefault: false });
            expect(existingAddress.isDefault).toBe(true);

        });

    });

    describe("deleteAddress", () => {

        it("returns 404 when the address does not belong to the user", async () => {

            Address.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" } };
            const res = mockResponse();

            await addressController.deleteAddress(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("deletes a non-default address without promoting another", async () => {

            const existingAddress = { isDefault: false, deleteOne: jest.fn().mockResolvedValue(true) };
            Address.findOne.mockResolvedValue(existingAddress);

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" } };
            const res = mockResponse();

            await addressController.deleteAddress(req, res);

            expect(existingAddress.deleteOne).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        });

        it("promotes the oldest remaining address to default when the default address is deleted", async () => {

            const existingAddress = { isDefault: true, deleteOne: jest.fn().mockResolvedValue(true) };
            const nextAddress = { isDefault: false, save: jest.fn().mockResolvedValue(true) };

            // First call resolves directly (ownership lookup), second call returns a chainable query (next-default lookup)
            Address.findOne
                .mockResolvedValueOnce(existingAddress)
                .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(nextAddress) });

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" } };
            const res = mockResponse();

            await addressController.deleteAddress(req, res);

            expect(nextAddress.isDefault).toBe(true);
            expect(nextAddress.save).toHaveBeenCalled();

        });

        it("does nothing extra when no other addresses remain after deleting the default", async () => {

            const existingAddress = { isDefault: true, deleteOne: jest.fn().mockResolvedValue(true) };
            Address.findOne
                .mockResolvedValueOnce(existingAddress)
                .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(null) });

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" } };
            const res = mockResponse();

            await addressController.deleteAddress(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        });

    });

    describe("setDefaultAddress", () => {

        it("returns 404 when the address does not belong to the user", async () => {

            Address.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" } };
            const res = mockResponse();

            await addressController.setDefaultAddress(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("clears other defaults and sets this address as default", async () => {

            const existingAddress = { isDefault: false, save: jest.fn().mockResolvedValue(true) };
            Address.findOne.mockResolvedValue(existingAddress);

            const req = { user: { id: "user-1" }, params: { addressId: "addr-1" } };
            const res = mockResponse();

            await addressController.setDefaultAddress(req, res);

            expect(Address.updateMany).toHaveBeenCalledWith({ user: "user-1" }, { isDefault: false });
            expect(existingAddress.isDefault).toBe(true);
            expect(existingAddress.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);

        });

    });

});
