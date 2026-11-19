/**
 * Event type registry. To add a type, create a descriptor file in this folder
 * that default-exports { type, notificationTypeId, normalize(raw) }, import it
 * below and add it to the list. The pipeline needs no other change.
 *
 * @typedef {{ type: string, notificationTypeId: number, normalize(raw: object): object }} EventDescriptor
 */
import userRegistered from "./userRegistered.js";
import passwordReset from "./passwordReset.js";
import userDeleted from "./userDeleted.js";

/**
 * @param {EventDescriptor[]} descriptors
 * @returns {Map<string, EventDescriptor>}
 */
export function buildRegistry(descriptors) {
  const map = new Map();
  for (const d of descriptors) {
    if (map.has(d.type)) throw new Error(`Duplicate event type: ${d.type}`);
    map.set(d.type, d);
  }
  return map;
}

/** @type {ReadonlyMap<string, EventDescriptor>} */
export const registry = buildRegistry([userRegistered, passwordReset, userDeleted]);
