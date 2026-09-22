const EventEmitter = require("events");

jest.mock("../../src/models/Product", () => ({
  watch: jest.fn()
}));
jest.mock("../../src/models/User", () => ({
  find: jest.fn()
}));
jest.mock("../../src/models/Notification", () => ({
  insertMany: jest.fn()
}));

const Product = require("../../src/models/Product");
const User = require("../../src/models/User");
const Notification = require("../../src/models/Notification");
const startProductChangeStream = require("../../src/watchers/productChangeStream");

describe("product change stream", () => {
  let changeStream;
  let io;

  beforeEach(() => {
    changeStream = new EventEmitter();
    Product.watch.mockReturnValue(changeStream);
    User.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: "user-1" }, { _id: "user-2" }])
    });
    Notification.insertMany.mockResolvedValue([]);
    io = { emit: jest.fn() };
  });

  it("persists and broadcasts product creation", async () => {
    startProductChangeStream(io);

    changeStream.emit("change", {
      operationType: "insert",
      documentKey: { _id: "product-1" },
      fullDocument: { _id: "product-1", name: "Phone" }
    });
    await new Promise(setImmediate);

    expect(Notification.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        user: "user-1",
        title: "New product available",
        message: "Phone was added to the store."
      }),
      expect.objectContaining({ user: "user-2" })
    ]);
    expect(io.emit).toHaveBeenCalledWith("productCreated", expect.any(Object));
  });

  it("persists and broadcasts product deletion", async () => {
    startProductChangeStream(io);

    changeStream.emit("change", {
      operationType: "delete",
      documentKey: { _id: "product-1" }
    });
    await new Promise(setImmediate);

    expect(Notification.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        user: "user-1",
        title: "Product removed"
      }),
      expect.objectContaining({ user: "user-2" })
    ]);
    expect(io.emit).toHaveBeenCalledWith("productDeleted", {
      message: "Product deleted",
      data: { _id: "product-1" }
    });
  });
});