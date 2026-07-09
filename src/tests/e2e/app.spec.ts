import { test, expect, type Page } from "@playwright/test";

function createTestUser(suffix: string) {
  return {
    name: `E2E ${suffix}`,
    email: `e2e-${suffix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`,
    password: "password12345",
  };
}

async function registerAndLogin(
  page: Page,
  user = createTestUser("user")
) {
  await page.goto("/register");
  await page.getByPlaceholder("Name").fill(user.name);
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password (min 8 chars)").fill(user.password);

  const [registerRes] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes("/api/auth/register") &&
        res.request().method() === "POST"
    ),
    page.getByRole("button", { name: /create account/i }).click(),
  ]);

  expect(registerRes.ok(), `Registration failed (${registerRes.status()})`).toBeTruthy();
  await expect(page).toHaveURL(/dashboard/, { timeout: 30000 });
}

async function createAndOpenDocument(page: Page, title: string) {
  await page.getByRole("button", { name: /new document/i }).click();
  await page.getByPlaceholder("Document title").fill(title);

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.url().includes("/api/documents") &&
        res.request().method() === "POST" &&
        res.ok()
    ),
    page.getByRole("button", { name: /^create$/i }).click(),
  ]);

  const { document } = (await response.json()) as { document: { id: string } };
  await page.goto(`/documents/${document.id}`);
  await expect(page.getByLabel("Document editor")).toBeVisible({ timeout: 30000 });
}

test.describe("Auth Pages", () => {
  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Local-First Collaborative Editor/i })).toBeVisible();
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Sign In/i })).toBeVisible();
  });
});

test.describe("Protected Routes", () => {
  test("dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });
});

test.describe("Document workflow", () => {
  test("register, create document, edit offline-capable editor", async ({ page }) => {
    await registerAndLogin(page, createTestUser("edit"));
    await createAndOpenDocument(page, "E2E Test Doc");

    const editor = page.getByLabel("Document editor");
    await editor.fill("Hello from E2E");
    await expect(editor).toHaveValue("Hello from E2E");
  });

  test("document persists content after reload", async ({ page }) => {
    await registerAndLogin(page, createTestUser("reload"));
    await createAndOpenDocument(page, "Reload Test");

    const editor = page.getByLabel("Document editor");
    await editor.fill("Persist me");

    await Promise.race([
      page.waitForResponse(
        (res) =>
          res.url().includes("/sync") &&
          res.request().method() === "POST" &&
          res.ok(),
        { timeout: 10000 }
      ),
      page.waitForTimeout(2000),
    ]);

    await page.reload();
    await expect(page.getByLabel("Document editor")).toBeVisible({ timeout: 30000 });
    await expect(page.getByLabel("Document editor")).toHaveValue("Persist me", {
      timeout: 15000,
    });
  });

  test("editor remains usable while offline", async ({ page, context }) => {
    await registerAndLogin(page, createTestUser("offline"));
    await createAndOpenDocument(page, "Offline Test");

    const editor = page.getByLabel("Document editor");
    await editor.fill("Online edit");

    await context.setOffline(true);
    await editor.fill("Online edit\nOffline line");
    await expect(editor).toHaveValue("Online edit\nOffline line");
    await expect(page.getByText("Offline", { exact: true })).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText("Synced", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(editor).toHaveValue("Online edit\nOffline line", { timeout: 15000 });
  });
});

test.describe("Viewer restrictions", () => {
  test("viewer role disables Snapshot and AI Assistant and shows View only badge", async ({ page }) => {
    await registerAndLogin(page, createTestUser("viewer"));
    await createAndOpenDocument(page, "Viewer Test");

    const docId = page.url().split("/documents/")[1]?.split("?")[0] ?? "";

    await page.route(`**/api/documents/${docId}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const json = await response.json();
      await route.fulfill({
        status: response.status(),
        contentType: "application/json",
        body: JSON.stringify({ ...json, role: "VIEWER" }),
      });
    });

    await page.reload();
    await expect(page.getByLabel("Your role: Viewer")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/read-only/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /snapshot/i })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: /ai assistant/i })).toHaveAttribute(
      "aria-disabled",
      "true"
    );

    const editor = page.getByLabel("Document editor");
    await expect(editor).toHaveAttribute("readonly", "");
  });
});
