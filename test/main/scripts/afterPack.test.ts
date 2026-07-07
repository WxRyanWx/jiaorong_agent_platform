import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadAfterPack = async () => {
  return (await import("../../../scripts/afterPack.js")).default as (context: {
    targets: Array<{ name: string }>;
    appOutDir: string;
    electronPlatformName: string;
    arch?: number | string;
    packager?: {
      projectDir?: string;
      appInfo?: {
        productFilename?: string;
      };
    };
  }) => Promise<void>;
};

describe("afterPack", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "deepchat-after-pack-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("keeps non-Linux packages unchanged", async () => {
    const afterPack = await loadAfterPack();
    const launcherPath = path.join(tmpDir, "JiaorongAI");
    await writeFile(launcherPath, "launcher");

    await afterPack({
      targets: [],
      appOutDir: tmpDir,
      electronPlatformName: "darwin",
    });

    await expect(stat(launcherPath)).resolves.toBeTruthy();
    await expect(readFile(launcherPath, "utf8")).resolves.toBe("launcher");
  });

  it("adds the Linux launcher wrapper for AppImage builds", async () => {
    const afterPack = await loadAfterPack();
    const launcherPath = path.join(tmpDir, "jiaorongsuperintelligentagent");
    await writeFile(launcherPath, "#!/bin/bash\n");

    await afterPack({
      targets: [{ name: "AppImage" }],
      appOutDir: tmpDir,
      electronPlatformName: "linux",
      packager: {
        appInfo: {
          executableName: "jiaorongsuperintelligentagent",
          productName: "JiaorongAI",
        },
      },
    });

    const launcherScript = await readFile(launcherPath, "utf8");
    await expect(
      stat(path.join(tmpDir, "jiaorongsuperintelligentagent.bin")),
    ).resolves.toBeTruthy();
    expect(launcherScript).toContain("--no-sandbox");
    expect(launcherScript).toContain("register_deepchat_protocol");
    expect(launcherScript).toContain("x-scheme-handler/deepchat");
    expect(launcherScript).toContain('Exec="${EXECUTABLE}" %u');
  });

  it("adds the Linux launcher wrapper for tar.gz builds", async () => {
    const afterPack = await loadAfterPack();
    const launcherPath = path.join(tmpDir, "jiaorongsuperintelligentagent");
    await writeFile(launcherPath, "#!/bin/bash\n");

    await afterPack({
      targets: [{ name: "tar.gz" }],
      appOutDir: tmpDir,
      electronPlatformName: "linux",
      packager: {
        appInfo: {
          executableName: "jiaorongsuperintelligentagent",
          productName: "JiaorongAI",
        },
      },
    });

    const launcherScript = await readFile(launcherPath, "utf8");
    expect(launcherScript).toContain("xdg-mime default jiaorong-ai.desktop");
  });

  it.each([
    ["arm64", 3, "fff-bin-darwin-arm64"],
    ["x64", 1, "fff-bin-darwin-x64"],
  ])(
    "copies FFF native packages into unpacked mac %s app node_modules",
    async (_, arch, packageDir) => {
      const afterPack = await loadAfterPack();
      const projectDir = path.join(tmpDir, "project");
      const sourceDir = path.join(
        projectDir,
        "node_modules",
        ".pnpm",
        "node_modules",
        "@ff-labs",
        packageDir,
      );
      const nodeModulesDir = path.join(
        tmpDir,
        "JiaorongAI.app",
        "Contents",
        "Resources",
        "app.asar.unpacked",
        "node_modules",
      );

      await writeFile(path.join(tmpDir, "JiaorongAI"), "launcher");
      await mkdir(sourceDir, { recursive: true });
      await mkdir(path.join(nodeModulesDir, "@ff-labs", "fff-node"), {
        recursive: true,
      });
      await writeFile(
        path.join(sourceDir, "package.json"),
        `{"name":"@ff-labs/${packageDir}"}`,
      );
      await writeFile(path.join(sourceDir, "libfff_c.dylib"), "native");
      await writeFile(
        path.join(nodeModulesDir, "@ff-labs", "fff-node", "package.json"),
        "{}",
      );

      await afterPack({
        targets: [],
        appOutDir: tmpDir,
        electronPlatformName: "darwin",
        arch,
        packager: {
          projectDir,
          appInfo: {
            productFilename: "JiaorongAI",
          },
        },
      });

      await expect(
        readFile(
          path.join(nodeModulesDir, "@ff-labs", packageDir, "libfff_c.dylib"),
          "utf8",
        ),
      ).resolves.toBe("native");
    },
  );

  it("fails fast when FFF node output is missing for supported packages", async () => {
    const afterPack = await loadAfterPack();
    const expectedFffNodeDir = path.join(
      tmpDir,
      "JiaorongAI.app",
      "Contents",
      "Resources",
      "app.asar.unpacked",
      "node_modules",
      "@ff-labs",
      "fff-node",
    );

    await expect(
      afterPack({
        targets: [],
        appOutDir: tmpDir,
        electronPlatformName: "darwin",
        arch: 3,
        packager: {
          projectDir: path.join(tmpDir, "project"),
          appInfo: {
            productFilename: "JiaorongAI",
          },
        },
      }),
    ).rejects.toThrow(
      `Missing unpacked @ff-labs/fff-node at ${expectedFffNodeDir}`,
    );
  });
});
