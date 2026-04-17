import type * as Party from "partykit/server";

/**
 * Optional Track 2 — minimal PartyKit room (positions sync stub).
 * Run: `npx partykit dev` after configuring partykit.json if you extend this.
 */
export default class CursorCrewParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(connection: Party.Connection): void {
    connection.send(JSON.stringify({ type: "hello", room: this.room.id }));
  }

  onMessage(
    message: string | ArrayBuffer | ArrayBufferView,
    _sender: Party.Connection,
  ): void {
    const text =
      typeof message === "string" ? message : new TextDecoder().decode(message);
    for (const conn of this.room.getConnections()) {
      conn.send(text);
    }
  }
}
