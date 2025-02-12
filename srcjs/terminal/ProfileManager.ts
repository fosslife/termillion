export class ProfileManager {
  private modal: HTMLElement | null = null;

  constructor(
    private config: Config,
    private onSave: (profiles: ProfilesConfig) => void
  ) {}

  show(): void {
    if (this.modal) {
      this.modal.remove();
    }

    this.modal = document.createElement("div");
    this.modal.className = "profile-manager-modal";

    // Modal content
    const content = document.createElement("div");
    content.className = "modal-content";

    // Profile list
    const profileList = document.createElement("div");
    profileList.className = "profile-list";

    this.config.profiles?.list.forEach((profile, index) => {
      const profileItem = this.createProfileItem(profile, index);
      profileList.appendChild(profileItem);
    });

    // Add new profile button
    const addButton = document.createElement("button");
    addButton.className = "add-profile";
    addButton.textContent = "+ Add Profile";
    addButton.addEventListener("click", () => {
      const newProfile = this.createNewProfile();
      const profileItem = this.createProfileItem(newProfile, -1);
      profileList.appendChild(profileItem);
    });

    // Save button
    const saveButton = document.createElement("button");
    saveButton.className = "save-profiles";
    saveButton.textContent = "Save Changes";
    saveButton.addEventListener("click", () => this.saveProfiles(profileList));

    // Assemble modal
    content.appendChild(profileList);
    content.appendChild(addButton);
    content.appendChild(saveButton);
    this.modal.appendChild(content);

    // Add to document
    document.body.appendChild(this.modal);
  }

  private createProfileItem(profile: Profile, index: number): HTMLElement {
    const item = document.createElement("div");
    item.className = "profile-item";

    // Name input
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = profile.name;
    nameInput.placeholder = "Profile Name";

    // Command input
    const commandInput = document.createElement("input");
    commandInput.type = "text";
    commandInput.value = profile.command;
    commandInput.placeholder = "Command";

    // Args input
    const argsInput = document.createElement("input");
    argsInput.type = "text";
    argsInput.value = profile.args?.join(" ") || "";
    argsInput.placeholder = "Arguments (space separated)";

    // Delete button
    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-profile";
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => {
      // Check if this is the last profile
      const profileItems = this.modal?.querySelectorAll(".profile-item");
      if (profileItems && profileItems.length <= 1) {
        alert("You must have at least one profile");
        return;
      }
      item.remove();
    });

    item.appendChild(nameInput);
    item.appendChild(commandInput);
    item.appendChild(argsInput);
    item.appendChild(deleteButton);

    return item;
  }

  private createNewProfile(): Profile {
    return {
      name: "New Profile",
      command: "",
      args: [],
    };
  }

  private saveProfiles(profileList: HTMLElement): void {
    const profiles: Profile[] = [];
    const items = profileList.querySelectorAll(".profile-item");

    items.forEach((item) => {
      const inputs = item.querySelectorAll("input");
      const name = inputs[0].value.trim();
      const command = inputs[1].value.trim();
      const args = inputs[2].value
        .split(" ")
        .map((arg) => arg.trim())
        .filter((arg) => arg.length > 0);

      if (name && command) {
        profiles.push({
          name,
          command,
          args: args.length > 0 ? args : undefined,
        });
      }
    });

    if (profiles.length > 0) {
      this.onSave({
        list: profiles,
        default: this.config.profiles?.default || profiles[0].name,
      });
    }

    this.modal?.remove();
    this.modal = null;
  }
}
