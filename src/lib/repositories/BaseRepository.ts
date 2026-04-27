export abstract class BaseRepository<T, CreateInput, UpdateInput> {
  constructor(protected model: any) {}

  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  async findAll(options?: { skip?: number; take?: number; where?: any }): Promise<T[]> {
    return this.model.findMany(options);
  }

  async create(data: CreateInput): Promise<T> {
    return this.model.create({ data });
  }

  async update(id: string, data: UpdateInput): Promise<T> {
    return this.model.update({ where: { id }, data });
  }

  async softDelete(id: string): Promise<T> {
    return this.model.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
