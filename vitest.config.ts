import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./src/worker/index.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Tests set identity explicitly; never inherit .dev.vars.
        bindings: {
          DEV_ACCESS_EMAIL: "",
          ACCESS_AUD: "test-aud",
          ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
        },
      },
    })),
  ],
  test: { setupFiles: ["./test/apply-migrations.ts"] },
});
