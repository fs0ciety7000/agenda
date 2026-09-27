import { HttpStatus, PipeTransform } from '@nestjs/common';
import { z, type ZodType } from 'zod';
import { AppException } from './app-exception';

/** Valide/normalise une entrée avec un schéma de @agenda/contracts. */
export class ZodPipe<T extends ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        'Validation failed',
        z.flattenError(result.error),
      );
    }
    return result.data;
  }
}
