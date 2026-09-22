module UserData exposing (UserData, empty)

import Task_ exposing (Task)


type alias UserData =
    { tasks : List Task
    }


empty : UserData
empty =
    { tasks = [] }
