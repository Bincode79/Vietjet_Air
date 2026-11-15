'use client';

import React from 'react';
import UserChat from './UserChat';

/**
 * Global mount point for the chat surfaces. Rendered once from the root layout
 * so every page carries them; each widget decides for itself whether the
 * current viewer may see it (UserChat hides on the admin console).
 *
 * The OpenClaw assistant widget used to live here too. It was removed with
 * the rest of the OpenClaw integration — the admin console now has no AI
 * chat surface.
 */
export default function ChatWidgets() {
  return (
    <>
      <UserChat />
    </>
  );
}
