/** Isolated generation identity: late Python results must never update a different project. */
/** Strict identity gate: computation may finish AFTER the user changes projects. */
export class SketchDraftGate {
  private generation = 0;
  private projectId: string | null = null;
  private sourceId: string | null = null;
  begin(projectId: string, sourceId: string): number {
    this.generation++;
    this.projectId = projectId;
    this.sourceId = sourceId;
    return this.generation;
  }
  isCurrent(ticket: number, projectId: string, sourceId: string): boolean {
    return ticket === this.generation && this.projectId === projectId && this.sourceId === sourceId;
  }
  cancel(): void {
    this.generation++;
    this.projectId = null;
    this.sourceId = null;
  }
}

