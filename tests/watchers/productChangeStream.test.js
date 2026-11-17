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
const { initProductEvents, isChangeStreamActive, setChangeStreamActive } = require("../../src/realtime/productEvents");
const startProductChangeStream = require("../../src/watchers/productChangeStream");

describe("product change stream", () => {
  let changeStream;
  let io;

  beforeEach(() => {
    jest.clearAllMocks();
    changeStream = new EventEmitter();
    Product.watch.mockReturnValue(changeStream);
    User.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: "user-1" }, { _id: "user-2" }])
    });
    Notification.insertMany.mockResolvedValue([]);
    io = { emit: jest.fn() };
    initProductEvents(io);
    setChangeStreamActive(false);
  });

  it("marks the change stream as the active event source", () => {
    startProductChangeStream();

    expect(isChangeStreamActive()).toBe(true);
  });

  it("persists and broadcasts product creation", async () => {
    startProductChangeStream();

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
    expect(io.emit).toHaveBeenCalledWith("productCreated", expect.objectContaining({
      data: { _id: "product-1", name: "Phone" }
    }));
  });

  it("persists and broadcasts product deletion", async () => {
    startProductChangeStream();

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

  it("broadcasts stock-only updates without notifying users", async () => {
    startProductChangeStream();

    changeStream.emit("change", {
      operationType: "update",
      documentKey: { _id: "product-1" },
      updateDescription: { updatedFields: { stock: 3, updatedAt: new Date() }, removedFields: [] },
      fullDocument: { _id: "product-1", name: "Phone", stock: 3 }
    });
    await new Promise(setImmediate);

    expect(io.emit).toHaveBeenCalledWith("productUpdated", expect.objectContaining({
      data: expect.objectContaining({ stock: 3 })
    }));
    expect(Notification.insertMany).not.toHaveBeenCalled();
  });

  it("hands over to in-process events if the stream fails", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    startProductChangeStream();

    changeStream.emit("error", new Error("not a replica set"));

    expect(isChangeStreamActive()).toBe(false);
    console.error.mockRestore();
  });
});
