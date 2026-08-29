require('./mock_electron.js');
import { initDatabase, getDatabase } from '../main/db';

initDatabase();
const db = getDatabase();

console.log('Seeding the local database...');

db.transaction(() => {
  // 1. Inserción de Categorías
  db.exec(`
    INSERT OR IGNORE INTO categories (id, name, slug) VALUES
    ('CAT-01', 'Cremoladas al Agua', 'cremoladas-al-agua'),
    ('CAT-02', 'Cremoladas con Leche', 'cremoladas-con-leche');
  `);

  // 2. Inserción de Productos Base
  db.exec(`
    INSERT OR IGNORE INTO products (id, category_id, sku, name, description, cost, price, is_active) VALUES
    ('PROD-01', 'CAT-01', 'FRE-AG-01', 'Cremolada de Fresa', 'Cremolada de fresa natural al agua', 0.00, 0.00, 1),
    ('PROD-02', 'CAT-01', 'PCO-AG-02', 'Cremolada de Piña Colada', 'Cremolada de piña colada al agua', 0.00, 0.00, 1),
    ('PROD-03', 'CAT-01', 'MAR-AG-03', 'Cremolada de Maracuyá', 'Cremolada de maracuyá fresca al agua', 0.00, 0.00, 1),
    ('PROD-04', 'CAT-01', 'TAM-AG-04', 'Cremolada de Tamarindo', 'Cremolada de tamarindo al agua', 0.00, 0.00, 1),
    ('PROD-05', 'CAT-01', 'MAN-AG-05', 'Cremolada de Mango', 'Cremolada de mango maduro al agua', 0.00, 0.00, 1),
    ('PROD-06', 'CAT-01', 'MCI-AG-06', 'Cremolada de Mango Ciruelo', 'Cremolada de mango ciruelo al agua', 0.00, 0.00, 1),
    ('PROD-07', 'CAT-02', 'CHO-LC-07', 'Cremolada de Chocolate', 'Cremolada de chocolate con leche cremosa', 0.00, 0.00, 1),
    ('PROD-08', 'CAT-02', 'LUC-LC-08', 'Cremolada de Lúcuma', 'Cremolada de lúcuma con leche cremosa', 0.00, 0.00, 1);
  `);

  // 3. Creación de los Grupos de Modificadores (Tamaños de Vasos) -> addon_groups
  db.exec(`
    INSERT OR IGNORE INTO addon_groups (id, name, description, is_required) VALUES
    ('GRP-TAMANO-AG', 'Tamaño de Cremolada al Agua', 'Selecciona el tamaño de vaso para cremoladas al agua', 1),
    ('GRP-TAMANO-LC', 'Tamaño de Cremolada con Leche', 'Selecciona el tamaño de vaso para cremoladas con leche', 1);
  `);

  // 4. Asociación de los Grupos con los Productos correspondientes -> addon_group_product
  db.exec(`
    INSERT OR IGNORE INTO addon_group_product (product_id, addon_group_id) VALUES
    ('PROD-01', 'GRP-TAMANO-AG'),
    ('PROD-02', 'GRP-TAMANO-AG'),
    ('PROD-03', 'GRP-TAMANO-AG'),
    ('PROD-04', 'GRP-TAMANO-AG'),
    ('PROD-05', 'GRP-TAMANO-AG'),
    ('PROD-06', 'GRP-TAMANO-AG'),
    ('PROD-07', 'GRP-TAMANO-LC'),
    ('PROD-08', 'GRP-TAMANO-LC');
  `);

  // 5. Inserción de Opciones de Modificador y Precios -> addons (we will map extra_price to price)
  db.exec(`
    INSERT OR IGNORE INTO addons (id, addon_group_id, name, price) VALUES
    -- Opciones para cremoladas Al Agua
    ('MOD-AG-MINI', 'GRP-TAMANO-AG', 'VASO MINI 6.5 OZ', 8.50),
    ('MOD-AG-PEQ',  'GRP-TAMANO-AG', 'VASO PEQUEÑO 8OZ', 9.50),
    ('MOD-AG-MED',  'GRP-TAMANO-AG', 'VASO MEDIANO 12OZ', 11.50),
    ('MOD-AG-GRA',  'GRP-TAMANO-AG', 'VASO GRANDE 16 OZ', 14.50),
    ('MOD-AG-FAM',  'GRP-TAMANO-AG', 'VASO FAMILIAR 32 OZ', 26.00),
    -- Opciones para cremoladas Con Leche
    ('MOD-LC-MINI', 'GRP-TAMANO-LC', 'VASO MINI 6.5 OZ', 8.50),
    ('MOD-LC-PEQ',  'GRP-TAMANO-LC', 'VASO PEQUEÑO 8OZ', 9.50),
    ('MOD-LC-MED',  'GRP-TAMANO-LC', 'VASO MEDIANO 12OZ', 11.50),
    ('MOD-LC-GRA',  'GRP-TAMANO-LC', 'VASO GRANDE 16 OZ', 14.50),
    ('MOD-LC-FAM',  'GRP-TAMANO-LC', 'VASO FAMILIAR 32 OZ', 26.00);
  `);
})();

console.log('Seed completed successfully!');
