const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const mockIoApp = () => ({
    get: jest.fn().mockReturnValue({ emit: jest.fn() })
});

module.exports = { mockResponse, mockIoApp };
