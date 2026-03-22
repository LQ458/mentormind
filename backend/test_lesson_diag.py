
import sys
import os
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

try:
    from database.models.lesson import Lesson
    print(f"Lesson class found at: {Lesson.__module__}")
    columns = [col.name for col in Lesson.__table__.columns]
    print(f"Columns in Lesson: {columns}")
    
    if 'user_id' in columns:
        print("✅ 'user_id' column IS present in the Lesson model.")
    else:
        print("❌ 'user_id' column IS NOT present in the Lesson model.")
        
    # Check if LessonStorageSQL is using the same Lesson
    from database.storage import LessonStorageSQL
    import inspect
    print(f"LessonStorageSQL.save_lesson source file: {inspect.getfile(LessonStorageSQL.save_lesson)}")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
