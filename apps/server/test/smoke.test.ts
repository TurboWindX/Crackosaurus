describe("server router import smoke", () => {
  it("loads jobRouter without a real env/DB", async () => {
    const { jobRouter } = await import("../src/routers/jobRouter");
    expect(jobRouter).toBeDefined();
  });
  it("loads rainbowRouter", async () => {
    const { rainbowRouter } = await import("../src/routers/rainbowRouter");
    expect(rainbowRouter).toBeDefined();
  });
});
