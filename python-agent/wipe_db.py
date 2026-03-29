from google.cloud import firestore

def wipe_students():
    db = firestore.Client(project="algoworks-dev")
    docs = db.collection('students').stream()
    
    count = 0
    for doc in docs:
        doc.reference.delete()
        count += 1
        
    print(f"Successfully destroyed {count} legacy student records.")

if __name__ == '__main__':
    wipe_students()
