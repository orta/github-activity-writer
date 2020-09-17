import "regenerator-runtime/runtime";
import LightningFS from "@jkearl/lightning-fs";
import git from "isomorphic-git";
import streamSaver from "streamsaver";

import { createZipWriter } from "./vendor/createZipWriter";

document.addEventListener("DOMContentLoaded", function () {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    return start();
  }
});

type Depth = 0 | 1 | 2 | 3 | 4;

const onscreenData = [
  [] as Depth[],
  [] as Depth[],
  [] as Depth[],
  [] as Depth[],
  [] as Depth[],
  [] as Depth[],
  [] as Depth[],
] as const;

type DataType = typeof onscreenData;

// This needs to adjust with the day of the week
// it's to make sure sat/sun are always at the top/bottom
const dayIndex = new Date().getDay();
const counts = [
  dayIndex < 0 ? 49 : 50,
  dayIndex < 1 ? 49 : 50,
  dayIndex < 2 ? 49 : 50,
  dayIndex < 3 ? 49 : 50,
  dayIndex < 4 ? 49 : 50,
  dayIndex < 5 ? 49 : 50,
  dayIndex < 7 ? 49 : 50,
];

const meta = {
  size: 12,
  itemPadding: 2,
  maxDepth: 4,
};

const fillData = (depth: Depth) => {
  counts.forEach((c, ci) => {
    for (let index = 0; index < c; index++) {
      onscreenData[ci][index] = depth;
    }
  });
};

const colorForDepth = (depth: Depth) => {
  switch (depth) {
    case 0:
      return "#C4C4C4";
    case 1:
      return "#9CE9A8";
    case 2:
      return "#42C463";
    case 3:
      return "#31A14E";
    case 4:
      return "#226E39";
  }
};

type Context = {
  canvas: HTMLCanvasElement;
  data: DataType;
};

const render = (context: Context) => {
  const { canvas, data } = context;
  const ctx = canvas.getContext("2d");
  data.forEach((row, rowIndex) => {
    row.forEach((depth, colIndex) => {
      const x = colIndex * meta.size + ((colIndex - 1) * meta.itemPadding + meta.itemPadding);
      const y = rowIndex * meta.size + ((rowIndex - 1) * meta.itemPadding + meta.itemPadding);
      ctx.fillStyle = colorForDepth(depth);
      ctx.fillRect(x, y, meta.size, meta.size);
    });
  });
};

const registerGitDownloadClickHandler = (context: Context) => {
  document.getElementById("make-git-repo").onclick = async () => {
    const downloadButton = document.getElementById("make-git-repo") as HTMLButtonElement;
    downloadButton.disabled = true;
    downloadButton.textContent = "Generating...";
    context.canvas.style.opacity = "0.6";

    const emailInput = document.getElementById("email") as HTMLInputElement;
    const email = emailInput.value;

    const fs = new LightningFS("git-fs", { wipe: true });
    const pfs = fs.promises;

    await pfs.writeFile("/README.md", "### Readme");

    const gitDeets = { fs, gitdir: "/.git", dir: "/" };
    await git.init({ defaultBranch: "main", ...gitDeets });

    let offset = -1;
    let commitCount = 0;


    const totalBoxes = counts.reduce((a, b) => a + b, 0)
    let boxesLookedAt = 0
    const progress = document.getElementById("progress-bar")
    progress.style.opacity = "1"
    
    const progressText = document.getElementById("progress-text")
    progressText.textContent = "Creating commits"

    const updatePercent = () => {
      const perc = Math.round((boxesLookedAt/totalBoxes) * 100) 
      progress.style.width = `${perc}%`
    }

    // right to left
    for (let colIndex = 50; colIndex >= 0; colIndex--) {
      // bottom to top, 7 -> 0
      updatePercent()

      for (let rowIndex = 6; rowIndex >= 0; rowIndex--) {
        boxesLookedAt++

        const value = context.data[rowIndex][colIndex];

        if (value === undefined) continue;
        offset++;

        if (value !== 0) {
          const day = 24 * 60 * 60 * 1000;
          const timestamp = new Date(Date.now() - day * offset);

          commitCount++;

          const commit = () =>
          {
            commitCount++;

            return git.commit({
              message: `Commit ${commitCount} - ${offset} days ago`,
              author: { email: email, name: email.split("@")[0], timestamp: Math.floor(timestamp.valueOf() / 1000) },
              ...gitDeets,
            });
          }

          switch (value) {
            case 4:
              await commit();
              await commit();
              await commit();
              await commit();
              await commit();
              await commit();

            case 3:
              await commit();
              await commit();
              await commit();
              await commit();
              await commit();
              await commit();

            case 2:
              await commit();
              await commit();
              await commit();

            case 1:
              await commit();
          }
        }
      }
    }

    // Take the VFS, recurse through it all to extract all files
    // so we can dump them in a zip
    const vfsFiles = [];
    const dirs = [];

    const root = await pfs.readdir("/");
    const lookAtFolder = async (prefix: string, files: string[]) => {
      for (const file of files) {
        const filePath = prefix + file;
        const stat = await pfs.stat(filePath);
        if (stat.isDirectory()) {
          dirs.push("git-activity" + filePath + "/");
          const files = await pfs.readdir(filePath);
          await lookAtFolder(filePath + "/", files);
        } else {
          const content = await pfs.readFile(filePath);

          vfsFiles.push({
            name: "git-activity/" + filePath,
            stream: () => new Blob([content]).stream(),
          });
        }
      }
    };

    progressText.textContent = "Zipping"
    await lookAtFolder("/", root);

    const fileStream = streamSaver.createWriteStream("archive.zip");

    const readableZipStream = createZipWriter({
      start(ctrl) {
        for (const dir of dirs) {
          ctrl.enqueue({ name: dir, directory: true });
        }

        for (const file of vfsFiles) {
          ctrl.enqueue(file);
        }
        ctrl.close();
      },
      async pull(ctrl) {
        ctrl.close();
      },
    });

    const writer = fileStream.getWriter();
    const reader = readableZipStream.getReader();
    const pump = () => reader.read().then((res) => (res.done ? writer.close() : writer.write(res.value).then(pump)));

    pump();

    downloadButton.disabled = false;
    downloadButton.textContent = "Create new repo";
    context.canvas.style.opacity = "1";
    progress.style.opacity = "0"
    progressText.textContent = " "
  };
};

const registerRandomButtonFaff = (context: Context) => {
  document.getElementById("random").onclick = async () => {
    const showWeekends = Math.floor(Math.random() * 3) < 2;
    for (let colIndex = 50; colIndex >= 0; colIndex--) {
      // bottom to top, 7 -> 0
      for (let rowIndex = 6; rowIndex >= 0; rowIndex--) {
        const value = context.data[rowIndex][colIndex];
        if (value === undefined) continue;
        const randomDepth = Math.floor(Math.random() * 4);

        if (showWeekends && (rowIndex === 0 || rowIndex === 6)) {
          context.data[rowIndex][colIndex] = 0;
        } else {
          context.data[rowIndex][colIndex] = randomDepth as Depth;
        }
      }
    }

    save(context);
    render(context);
  };
};

const registerClearButtonFaff = (context: Context) => {
  document.getElementById("erase").onclick = async () => {
    fillData(0);
    save(context)
    render(context);
  }
}


const registerCanvasClickHandler = (context: Context) => {
  const { canvas, data } = context;
  var leftMouseButtonOnlyDown = false;

  function setLeftButtonState(e) {
    leftMouseButtonOnlyDown = e.buttons === undefined ? e.which === 1 : e.buttons === 1;
  }

  document.body.onmousedown = (e) => {
    setLeftButtonState(e);
    document.onmousemove(e);
  };
  document.body.onmousemove = setLeftButtonState;
  document.body.onmouseup = setLeftButtonState;

  document.onmousemove = (e) => {
    if (!leftMouseButtonOnlyDown) return;
    
    const elemLeft =
      canvas.parentElement.offsetLeft + canvas.parentElement.clientLeft + canvas.offsetLeft + canvas.clientLeft;
    const elemTop =
      canvas.parentElement.offsetTop + canvas.offsetTop + canvas.parentElement.clientTop + canvas.clientTop;

    const localX = e.pageX - elemLeft;
    const localY = e.pageY - elemTop;

    let found = false;
    data.forEach((row, rowIndex) => {
      if (found) return;
      row.forEach((_, colIndex) => {
        if (found) return;

        const x = colIndex * meta.size + ((colIndex - 1) * meta.itemPadding + meta.itemPadding);
        const y = rowIndex * meta.size + ((rowIndex - 1) * meta.itemPadding + meta.itemPadding);
        debugger;
        if (x < localX && x + meta.size > localX && y < localY && y + meta.size > localY) {
          found = true;
          clickedOnItem(context, colIndex, rowIndex);
        }
      });
    });
  };
};

const clickedOnItem = (context: Context, col: number, row: number) => {
  const { data } = context;

  const existingDepth = data[row][col];
  let newDepth = (existingDepth + 1) as Depth;
  if (newDepth > meta.maxDepth) newDepth = 0;
  data[row][col] = newDepth;

  save(context);
  render(context);
};

const save = (context: Context) => {
  const { data } = context;

  let hash = "map=";
  data.forEach((row) => {
    row.forEach((depth) => {
      hash += depth + ",";
    });
  });

  document.location.hash = hash;
};

const load = (): DataType => {
  const params = new URLSearchParams(document.location.hash.replace("#", ""));
  if (!params.has("map")) return;

  const map = params.get("map").split(",");

  let mapIndex = 0;
  counts.forEach((c, ci) => {
    for (let index = 0; index < c; index++) {
      onscreenData[ci][index] = Number(map[mapIndex]) as Depth;
      mapIndex++;
    }
  });
};

const registerEmailFaff = () => {
  const emailInput = document.getElementById("email") as HTMLInputElement;
  emailInput.onkeyup = () => {
    if (emailInput.value && emailInput.value.includes(".") && emailInput.value.includes("@")) {
      const gitButton = document.getElementById("make-git-repo") as HTMLButtonElement;
      gitButton.disabled = false;

      const note = document.getElementById("email-note") as HTMLDivElement;
      note.style.display = "none";
    }
  };
};

const start = () => {
  const  UA = navigator.userAgent
  const hasTouchScreen =
    /\b(BlackBerry|webOS|iPhone|IEMobile)\b/i.test(UA) ||
    /\b(Android|Windows Phone|iPad|iPod)\b/i.test(UA)

  if (hasTouchScreen) {
    alert("This website is not built for mobile devices, it needs a file-system to be useful, come back on a computer.")
  }

  fillData(0);

  const canvas = document.getElementById("renderer") as HTMLCanvasElement;
  const context = {
    canvas,
    data: onscreenData,
  };

  registerGitDownloadClickHandler(context);
  registerCanvasClickHandler(context);
  registerEmailFaff();
  registerRandomButtonFaff(context);
  registerClearButtonFaff(context);
  load();
  render(context);
};
