import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'IS_PUBLIC';

/** Marks a route or controller as publicly accessible, bypassing the JWT auth guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
