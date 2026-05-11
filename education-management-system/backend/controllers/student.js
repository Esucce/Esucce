const pool = require('../config/database');

// Get Personal Profile
exports.getProfile = async (req, res) => {
  try {
    const studentId = req.user.user_id;

    const result = await pool.query(
      `SELECT 
        u.user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.email,
        se.class_id,
        c.class_name,
        c.grade_level
      FROM users u
      LEFT JOIN student_enrollment se ON u.user_id = se.student_id AND se.is_active = TRUE
      LEFT JOIN classes c ON se.class_id = c.class_id
      WHERE u.user_id = $1`,
      [studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching profile'
    });
  }
};

// Get Current Results (Result Checker)
exports.getCurrentResults = async (req, res) => {
  try {
    const studentId = req.user.user_id;
    const { academic_session, term } = req.query;

    let query = `
      SELECT 
        s.subject_name,
        s.subject_code,
        r.continuous_assessment,
        r.exam_score,
        r.total_score,
        r.grade,
        r.comment,
        r.academic_session,
        r.term
      FROM results r
      JOIN subjects s ON r.subject_id = s.subject_id
      WHERE r.student_id = $1
    `;

    const params = [studentId];

    if (academic_session) {
      query += ` AND r.academic_session = $${params.length + 1}`;
      params.push(academic_session);
    } else {
      query += ` AND r.academic_session = (SELECT academic_session FROM classes ORDER BY created_at DESC LIMIT 1)`;
    }

    if (term) {
      query += ` AND r.term = $${params.length + 1}`;
      params.push(term);
    }

    query += ` ORDER BY s.subject_name`;

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      data: {
        academic_session: result.rows[0]?.academic_session || 'N/A',
        term: result.rows[0]?.term || 'N/A',
        results: result.rows
      }
    });
  } catch (error) {
    console.error('Get current results error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching current results'
    });
  }
};

// Get Historical Results (Academic Transcript)
exports.getHistoricalResults = async (req, res) => {
  try {
    const studentId = req.user.user_id;
    const { limit } = req.query;

    const limitValue = parseInt(limit) || 10;

    const result = await pool.query(
      `SELECT 
        r.academic_session,
        r.term,
        ROUND(AVG(r.total_score)::numeric, 2) as session_avg,
        json_agg(json_build_object(
          'subject_name', s.subject_name,
          'continuous_assessment', r.continuous_assessment,
          'exam_score', r.exam_score,
          'total_score', r.total_score,
          'grade', r.grade
        )) as results
      FROM results r
      JOIN subjects s ON r.subject_id = s.subject_id
      WHERE r.student_id = $1
      GROUP BY r.academic_session, r.term
      ORDER BY r.academic_session DESC, r.term DESC
      LIMIT $2`,
      [studentId, limitValue]
    );

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get historical results error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching historical results'
    });
  }
};

// Get Subject Performance
exports.getSubjectPerformance = async (req, res) => {
  try {
    const studentId = req.user.user_id;
    const { subject_id } = req.params;

    const subjectResult = await pool.query(
      `SELECT subject_name, subject_code FROM subjects WHERE subject_id = $1`,
      [subject_id]
    );

    if (subjectResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subject not found'
      });
    }

    const performanceResult = await pool.query(
      `SELECT 
        r.academic_session,
        r.term,
        r.continuous_assessment,
        r.exam_score,
        r.total_score,
        r.grade
      FROM results r
      WHERE r.student_id = $1 AND r.subject_id = $2
      ORDER BY r.academic_session DESC, r.term DESC`,
      [studentId, subject_id]
    );

    const avgResult = await pool.query(
      `SELECT ROUND(AVG(r.total_score)::numeric, 2) as overall_avg
       FROM results r
       WHERE r.student_id = $1 AND r.subject_id = $2`,
      [studentId, subject_id]
    );

    res.status(200).json({
      success: true,
      data: {
        subject_name: subjectResult.rows[0].subject_name,
        subject_code: subjectResult.rows[0].subject_code,
        performance_history: performanceResult.rows,
        overall_avg: avgResult.rows[0]?.overall_avg || 0
      }
    });
  } catch (error) {
    console.error('Get subject performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subject performance'
    });
  }
};
