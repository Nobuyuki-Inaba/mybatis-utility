import { updateXmlMapperSql, updateJavaAnnotationSql } from '../src/mapperWriter';

describe('updateXmlMapperSql', () => {
  test('replaces the body of the matching query id', () => {
    const content = `
    <mapper namespace="com.example.Mapper">
        <select id="findById" resultType="User">
            SELECT * FROM users WHERE id = #{id}
        </select>
    </mapper>`;
    const updated = updateXmlMapperSql(content, 'findById', 'SELECT * FROM users WHERE id = #{id} AND active = 1');
    expect(updated).toContain('SELECT * FROM users WHERE id = #{id} AND active = 1');
    expect(updated).toContain('<select id="findById" resultType="User">');
  });

  test('throws when the query id is not found', () => {
    const content = `<mapper namespace="x"><select id="a">SELECT 1</select></mapper>`;
    expect(() => updateXmlMapperSql(content, 'missing', 'SELECT 2')).toThrow();
  });
});

describe('updateJavaAnnotationSql', () => {
  test('single-line quoted string stays single-line when new SQL has no newline', () => {
    const content = `
      @Select("SELECT * FROM users WHERE id = #{id}")
      User findById(@Param("id") Long id);
    `;
    const updated = updateJavaAnnotationSql(content, 'findById', 'SELECT * FROM users WHERE id = #{id} AND active = 1');
    expect(updated).toContain('@Select("SELECT * FROM users WHERE id = #{id} AND active = 1")');
  });

  test('single-line string converts to text block when new SQL is multi-line', () => {
    const content = `
      @Select("SELECT * FROM users WHERE id = #{id}")
      User findById(@Param("id") Long id);
    `;
    const updated = updateJavaAnnotationSql(content, 'findById', 'SELECT *\nFROM users\nWHERE id = #{id}');
    expect(updated).toContain('"""');
    expect(updated).toContain('SELECT *');
    expect(updated).toContain('FROM users');
  });

  test('existing text block stays a text block on update', () => {
    const content = `
      @Select("""
          SELECT * FROM users WHERE id = #{id}
          """)
      User findById(@Param("id") Long id);
    `;
    const updated = updateJavaAnnotationSql(content, 'findById', 'SELECT * FROM users WHERE id = #{id} AND active = 1');
    expect(updated).toContain('"""');
    expect(updated).toContain('SELECT * FROM users WHERE id = #{id} AND active = 1');
  });

  test('string-array annotation is rewritten as a string array (not converted to a text block)', () => {
    const content = `
      @Mapper
      public interface OrderMapper {
          @Insert({
              "INSERT INTO orders_history (id, amount, user_id)",
              "SELECT id, amount, user_id",
              "FROM orders",
              "WHERE created_date < #{cutoffDate}"
          })
          int archiveOrders(@Param("cutoffDate") String cutoffDate);
      }
    `;
    const newSql = [
      'INSERT INTO orders_history (id, amount, user_id, note)',
      'SELECT id, amount, user_id, \'archived\'',
      'FROM orders',
      'WHERE created_date < #{cutoffDate}',
    ].join('\n');

    const updated = updateJavaAnnotationSql(content, 'archiveOrders', newSql);

    // Must remain array-of-strings, NOT converted to a """ text block
    // (text blocks require Java 15+, which the original file may not target).
    expect(updated).not.toContain('"""');
    expect(updated).toContain('@Insert({');
    expect(updated).toContain('"INSERT INTO orders_history (id, amount, user_id, note)"');
    expect(updated).toContain('"SELECT id, amount, user_id, \'archived\'"');
    expect(updated).toContain('"WHERE created_date < #{cutoffDate}"');
  });

  test('string-array write-back escapes embedded double quotes', () => {
    const content = `
      @Select({
          "SELECT * FROM users",
          "WHERE id = #{id}"
      })
      User findById(@Param("id") Long id);
    `;
    const updated = updateJavaAnnotationSql(content, 'findById', 'SELECT * FROM users WHERE name = "x" AND id = #{id}');
    expect(updated).toContain('\\"x\\"');
  });

  test('concatenated quoted-string annotation ("a" + "b") is found and rewritten', () => {
    const content = `
      @Mapper
      public interface OrderMapper {
          @Insert("INSERT INTO orders_history (id, amount, user_id) " +
                  "SELECT id, amount, user_id " +
                  "FROM orders " +
                  "WHERE created_date < #{cutoffDate}")
          int archiveOrders(@Param("cutoffDate") String cutoffDate);
      }
    `;
    const updated = updateJavaAnnotationSql(
      content,
      'archiveOrders',
      'INSERT INTO orders_history (id, amount, user_id) SELECT id, amount, user_id FROM orders WHERE created_date < #{cutoffDate} AND status = 1'
    );
    expect(updated).toContain(
      '@Insert("INSERT INTO orders_history (id, amount, user_id) SELECT id, amount, user_id FROM orders WHERE created_date < #{cutoffDate} AND status = 1")'
    );
  });

  test('throws when the method id is not found', () => {
    const content = `
      @Select("SELECT 1")
      Integer ping();
    `;
    expect(() => updateJavaAnnotationSql(content, 'missing', 'SELECT 2')).toThrow();
  });
});
