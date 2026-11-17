jest.mock("../../src/models/Product", () => ({ find: jest.fn() }));
jest.mock("../../src/models/User", () => ({ find: jest.fn() }));
jest.mock("../../src/models/Notification", () => ({ insertMany: jest.fn() }));

const Product = require("../../src/models/Product");
const User = require("../../src/models/User");
const Notification = require("../../src/models/Notification");
const {
  initProductEvents,
  setChangeStreamActive,
  publishProductChange,
  publishStockChange
} = require("../../src/realtime/productEvents");

describe("productEvents", () => {
  let io;

  beforeEach(() => {
    jest.clearAllMocks();
    io = { emit: jest.fn() };
    initProductEvents(io);
    setChangeStreamActive(false);
    User.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: "user-1" }]) });
    Notification.insertMany.mockResolvedValue([]);
  });

  describe("publishProductChange", () => {
    it("emits productDeleted straight away and notifies users", async () => {
      await publishProductChange("delete", { _id: "p1", name: "Phone" });

      expect(io.emit).toHaveBeenCalledWith("productDeleted", { message: "Product deleted", data: { _id: "p1" } });
      expect(Notification.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({ user: "user-1", title: "Product removed", message: "Phone was removed from the store." })
      ]);
    });

    it("emits the full product on update, converting Mongoose documents", async () => {
      const doc = { toObject: () => ({ _id: "p1", name: "Phone", stock: 4 }) };

      await publishProductChange("update", doc);

      expect(io.emit).toHaveBeenCalledWith("productUpdated", expect.objectContaining({
        data: { _id: "p1", name: "Phone", stock: 4 }
      }));
    });

    it("does nothing while the change stream is the event source (no duplicates)", async () => {
      setChangeStreamActive(true);

      await publishProductChange("delete", { _id: "p1" });

      expect(io.emit).not.toHaveBeenCalled();
      expect(Notification.insertMany).not.toHaveBeenCalled();
    });

    it("still emits when creating notifications fails", async () => {
      Notification.insertMany.mockRejectedValue(new Error("DB down"));
      jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(publishProductChange("insert", { _id: "p1", name: "Phone" })).resolves.toBeUndefined();

      expect(io.emit).toHaveBeenCalledWith("productCreated", expect.any(Object));
      console.error.mockRestore();
    });
  });

  describe("publishStockChange", () => {
    it("pushes the current stock of each product without notifying users", async () => {
      Product.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: "p1", stock: 2 }]) });

      await publishStockChange(["p1", "p1"]);

      expect(Product.find).toHaveBeenCalledWith({ _id: { $in: ["p1"] } });
      expect(io.emit).toHaveBeenCalledWith("productUpdated", expect.objectContaining({
        data: { _id: "p1", stock: 2 },
        partial: true
      }));
      expect(Notification.insertMany).not.toHaveBeenCalled();
    });
  });
});
