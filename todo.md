# Termillion TODO List

## Core Features

- [ ] Terminal Profiles

  - [x] Different shell configurations
  - [ ] Customizable appearance per profile
  - [ ] Quick profile switching

- [ ] Plugin System

  - Plugin architecture
  - Plugin management UI
  - API for plugin development

- [ ] Terminal Multiplexing
  - Split panes (vertical/horizontal)
  - Synchronized scrolling
  - Pane management commands

## UI/UX Improvements

- [ ] Command Palette

  - Quick access to commands
  - Fuzzy search for actions
  - Keyboard shortcut integration

- [ ] Enhanced Tab Management

  - Tab reordering
  - Tab groups
  - Tab previews

- [ ] Custom Keybindings
  - User-defined shortcuts
  - Keybinding profiles
  - Conflict detection

## Performance

- [ ] Output Buffering

  - High output throttling
  - Performance monitoring
  - Resource usage optimization

- [ ] Memory Management
  - Terminal instance cleanup
  - Resource usage tracking
  - Automatic garbage collection

## Accessibility

- [ ] Screen Reader Support

  - Terminal content narration
  - UI element descriptions
  - Accessibility shortcuts

- [ ] Color Contrast Options
  - High contrast themes
  - Color blindness modes
  - Customizable color schemes

## Security

- [ ] Permission System

  - Granular permission control
  - Plugin permissions
  - Security audit logging

- [ ] Secure Shell Integration
  - SSH key management
  - Secure credential storage
  - Connection security indicators

## Documentation

- [ ] User Guide

  - Feature documentation
  - Configuration reference
  - Troubleshooting guide

- [ ] Developer Documentation
  - Plugin API reference
  - Contribution guidelines
  - Architecture overview

## Terminal Profiles Implementation Plan

### Core Functionality

- [ ] Profile Management

  - Add/Edit/Delete profiles
  - Set default profile
  - Profile properties:
    - Name
    - Command
    - Arguments
    - Environment variables
    - Working directory
    - Custom theme

- [ ] Profile Switching

  - Switch profiles for new tabs
  - Change profile for existing tabs
  - Keyboard shortcuts for quick profile switching

- [ ] Profile Persistence
  - Save profiles to config
  - Load profiles on startup
  - Profile validation

### UI Improvements

- [ ] Profile Selector Enhancements

  - Add profile icons/colors
  - Show active profile indicator
  - Add quick actions (set as default, duplicate, etc.)

- [ ] Profile Management UI

  - Modal for profile editing
  - Form validation
  - Live preview of profile settings

- [ ] Terminal Tab Indicators

  - Show profile name/icon in tab
  - Color coding for different profiles
  - Quick profile switch from tab context menu

- [ ] Command Palette Integration
  - Quick profile switching
  - Profile management commands

### Implementation Order

1. Basic profile management (add/edit/delete)
2. Profile selection UI
3. Profile persistence
4. Profile switching for new tabs
5. Profile switching for existing tabs
6. UI enhancements (icons, colors, indicators)
7. Command palette integration
8. Advanced features (environment variables, custom themes)
