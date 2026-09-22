import type { UserOutput } from './user.output.js';

export interface ListUsersOutput {
  users: UserOutput[];
  nextCursor: string | null;
}
