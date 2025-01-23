import {
  GoldenLayout,
  LayoutConfig,
  ItemType,
  ComponentContainer,
  ComponentItemConfig,
  ContentItem,
} from "golden-layout";

export class LayoutManager {
  private layout: GoldenLayout;
  private container: HTMLElement;

  constructor() {
    console.log("Initializing LayoutManager");
    this.container = document.getElementById("layout-container") as HTMLElement;
    console.log("Container:", this.container);

    // Set initial container size explicitly
    this.container.style.width = "100%";
    this.container.style.height = "100%";

    // Create GoldenLayout instance with container
    this.layout = new GoldenLayout(this.container);
    console.log("Layout created");

    this.layout.registerComponentFactoryFunction(
      "terminal-pane",
      (container: ComponentContainer, state: any) => {
        console.log("Registering terminal-pane component", state);
        const el = container.element;
        el.style.backgroundColor =
          "#" + Math.floor(Math.random() * 16777215).toString(16);
        el.innerHTML = `<div style="padding: 20px;">${state.text}</div>`;
      }
    );

    // Initial layout config. we will use row
    const config: LayoutConfig = {
      root: {
        type: ItemType.row,
        content: [
          {
            type: "component",
            title: "Terminal 1",
            componentName: "testComponent",
            componentState: { text: "Terminal 1" },
            componentType: "terminal-pane",
            width: 50,
          },
          {
            type: "component",
            title: "Terminal 2",
            componentName: "testComponent",
            componentState: { text: "Terminal 2" },
            componentType: "terminal-pane",
            width: 50,
          },
        ],
      },
    };
    // Column layout:
    // const config: LayoutConfig = {
    //   root: {
    //     type: ItemType.column,
    //     content: [
    //       {
    //         type: ItemType.component,
    //         componentType: "terminal-pane",
    //         title: "Terminal 1",
    //         componentState: { text: "Terminal 1" },
    //       },
    //       {
    //         type: ItemType.component,
    //         componentType: "terminal-pane",
    //         title: "Terminal 2",
    //         componentState: { text: "Terminal 2" },
    //       },
    //     ],
    //   },
    // };

    // Load the layout
    this.layout.loadLayout(config);

    // Set initial size
    // this.layout.setSize(
    //   this.container.offsetWidth,
    //   this.container.offsetHeight
    // );

    // Create a ResizeObserver to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
      console.log("Container resized");
      this.layout.setSize(
        this.container.offsetWidth,
        this.container.offsetHeight
      );
    });

    // Observe both container and its parent
    resizeObserver.observe(this.container);
    resizeObserver.observe(this.container.parentElement!);

    // Handle window resize
    // window.addEventListener("resize", () => {
    //   console.log("Window resized");
    //   this.layout.setSize(
    //     this.container.offsetWidth,
    //     this.container.offsetHeight
    //   );
    // });

    // Add keyboard shortcuts for testing splits
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.shiftKey) {
        if (e.key === "{") {
          console.log("Horizontal split");
          this.addSplit("horizontal", "New Horizontal Split");
        } else if (e.key === "}") {
          console.log("Vertical split");
          this.addSplit("vertical", "New Vertical Split");
        }
      }
    });
  }

  private addSplit(direction: "horizontal" | "vertical", text: string) {
    // Get the root item
    const rootItem = this.layout.rootItem;
    if (!rootItem) return;

    if (direction === "horizontal") {
      this.layout.addItem({
        type: ItemType.row,
        content: [
          {
            type: ItemType.component,
            componentType: "terminal-pane",
            title: "Terminal 2",
            componentState: { text: "Terminal 2" },
          },
        ],
      });
    } else {
      this.layout.addItem({
        type: ItemType.column,
        content: [
          {
            type: ItemType.component,
            componentType: "terminal-pane",
            title: "Terminal 2",
            componentState: { text: "Terminal 2" },
          },
        ],
      });
    }
  }
}

//help:
// adds a new tab, like stack
// this.layout.addComponent("terminal-pane", undefined, "Terminal 2");
