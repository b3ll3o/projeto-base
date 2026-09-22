export interface ListUsersInput {
  cursor?: string | null;
  limit: number;
  includeDeleted?: boolean;
}
