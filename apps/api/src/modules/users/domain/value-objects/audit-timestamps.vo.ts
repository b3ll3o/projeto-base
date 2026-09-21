export class AuditTimestamps {
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(createdAt: Date, updatedAt: Date) {
    if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) {
      throw new Error('AuditTimestamps: createdAt deve ser Date válida');
    }
    if (!(updatedAt instanceof Date) || Number.isNaN(updatedAt.getTime())) {
      throw new Error('AuditTimestamps: updatedAt deve ser Date válida');
    }
    if (updatedAt.getTime() < createdAt.getTime()) {
      throw new Error('AuditTimestamps: updatedAt não pode ser anterior a createdAt');
    }
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  static inicial(t: Date): AuditTimestamps {
    return new AuditTimestamps(t, t);
  }

  static restaurar(createdAt: Date, updatedAt: Date): AuditTimestamps {
    return new AuditTimestamps(createdAt, updatedAt);
  }

  marcarAtualizado(t: Date): AuditTimestamps {
    return new AuditTimestamps(this.createdAt, t);
  }
}
