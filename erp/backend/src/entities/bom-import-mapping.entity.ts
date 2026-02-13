import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface ColumnMapping {
  // Source column name from the file
  source_column: string;
  // Target field in the BOM item
  target_field: BomImportField;
}

export type BomImportField =
  | 'internal_part_number'
  | 'description'
  | 'alternate_ipn'
  | 'manufacturer'
  | 'manufacturer_pn'
  | 'quantity_required'
  | 'reference_designators'
  | 'line_number'
  | 'resource_type'
  | 'polarized'
  | 'notes'
  | 'ignore';

@Entity('bom_import_mappings')
export class BomImportMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb' })
  column_mappings: ColumnMapping[];

  @Column({ type: 'boolean', default: true })
  has_header_row: boolean;

  @Column({ type: 'integer', default: 0 })
  skip_rows: number;

  @Column({ type: 'boolean', default: false })
  multi_row_designators: boolean;

  @Column({ type: 'jsonb', nullable: true })
  ignore_columns: string[] | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
