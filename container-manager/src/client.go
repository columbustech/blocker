package main

import (
	"encoding/json"
	"fmt"
	appsv1 "k8s.io/api/apps/v1"
	apiv1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"net/http"
	"strconv"
	"strings"
	"bytes"
	"io"
)

func createFns(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Starting deployment creation")
	if r.Method == http.MethodPost {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Could not parse form.", http.StatusBadRequest)
			return
		}
		imagePath := r.PostForm.Get("imagePath")
		fnName := r.PostForm.Get("fnName")
		replicas, _ := strconv.Atoi(r.PostForm.Get("replicas"))

		startContainers(imagePath, fnName, replicas)
	}
}

func startContainers(imagePath string, fnName string, replicas int) {
	rep32 := int32(replicas)
	config, err := rest.InClusterConfig()
	if err != nil {
		panic(err.Error())
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		panic(err.Error())
	}
	deploymentsClient := clientset.AppsV1().Deployments(apiv1.NamespaceDefault)
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name: fnName,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas:        int32Ptr(rep32),
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"name": fnName,
				},
			},
			Template: apiv1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"name": fnName,
					},
				},
				Spec: apiv1.PodSpec{
					Containers: []apiv1.Container{
						{
							Name:  fnName,
							Image: imagePath,
							Ports: []apiv1.ContainerPort{
								{
									Name:          "http",
									Protocol:      apiv1.ProtocolTCP,
									ContainerPort: 8000,
								},
							},
							Resources: apiv1.ResourceRequirements{
								Requests: apiv1.ResourceList{
									apiv1.ResourceCPU: resource.MustParse("1"),
								},
							},
						},
					},
				},
			},
		},
	}
	result, err := deploymentsClient.Create(deployment)

	if err != nil {
		fmt.Println(err)
		for err != nil && strings.HasPrefix(err.Error(), "object is being deleted") {
			result, err = deploymentsClient.Create(deployment)
		}
	}

	fmt.Printf("Created deployment %q.\n", result.GetObjectMeta().GetName())

	servicesClient := clientset.CoreV1().Services(apiv1.NamespaceDefault)
	service := &apiv1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name: fnName,
		},
		Spec: apiv1.ServiceSpec{
			Selector: map[string]string{
				"name": fnName,
			},
			Ports: []apiv1.ServicePort{
				{
					Port:       80,
					TargetPort: intstr.FromInt(8000),
				},
			},
			Type: apiv1.ServiceTypeClusterIP,
		},
	}
	serviceResult, err := servicesClient.Create(service)
	if err != nil {
		panic(err)
	}

	fmt.Printf("Created service %q.\n", serviceResult.GetObjectMeta().GetName())
}

func fnStatusHelper(fnName string) string {
	config, err := rest.InClusterConfig()
	if err != nil {
		panic(err.Error())
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		panic(err.Error())
	}

	pods, err := clientset.CoreV1().Pods("default").List(metav1.ListOptions{
		LabelSelector: "name=" + fnName,
	})

	if items := pods.Items; len(items) == 0 {
		return "Missing"
	} else if statuses := items[0].Status.ContainerStatuses; len(statuses) == 0 {
		return "Missing"
	} else if v := statuses[0].State; v.Running != nil {
		for _, item := range items {
			if item.Status.ContainerStatuses[0].State.Running == nil {
				return "Missing"
			}
		}
		return "Running"
	} else if v.Waiting != nil && (v.Waiting.Reason == "ErrImagePull" || v.Waiting.Reason=="ImagePullBackOff" || v.Waiting.Reason=="CrashLoopBackOff") {
		return "Error"
	} else {
		return "Missing"
	}
}

type FnStatus struct {
	Status string `json:"fnStatus"`
}

func fnStatus(w http.ResponseWriter, r *http.Request) {
	fnName := r.URL.Query().Get("fnName")
	w.Header().Set("Content-Type", "application/json")
	fn_status := FnStatus{
		Status: fnStatusHelper(fnName),
	}
	json.NewEncoder(w).Encode(fn_status)
}

func int32Ptr(i int32) *int32 { return &i }

func deleteFns(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "Could not parse form.", http.StatusBadRequest)
			return
		}
		fnName := r.PostForm.Get("fnName")

		deletePolicy := metav1.DeletePropagationForeground

		config, err := rest.InClusterConfig()
		if err != nil {
			panic(err.Error())
		}

		clientset, err := kubernetes.NewForConfig(config)
		if err != nil {
			panic(err.Error())
		}
		deploymentsClient := clientset.AppsV1().Deployments(apiv1.NamespaceDefault)
		_ = deploymentsClient.Delete(fnName, &metav1.DeleteOptions{PropagationPolicy: &deletePolicy})
		fmt.Println("Deleted deployment.")

		servicesClient := clientset.CoreV1().Services(apiv1.NamespaceDefault)
		_ = servicesClient.Delete(fnName, &metav1.DeleteOptions{PropagationPolicy: &deletePolicy})
		fmt.Println("Deleted service.")
	}
}

func fnLogs(w http.ResponseWriter, r *http.Request) {
	fnName := r.URL.Query().Get("fnName")
	config, err := rest.InClusterConfig()
	if err != nil {
		panic(err.Error())
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		panic(err.Error())
	}

	pods, err := clientset.CoreV1().Pods("default").List(metav1.ListOptions{
		LabelSelector: "name=" + fnName,
	})
	logs := make([]string, len(pods.Items))
	for index, pod := range pods.Items {
		podLogOpts := apiv1.PodLogOptions{}
		req := clientset.CoreV1().Pods(pod.Namespace).GetLogs(pod.Name, &podLogOpts)
		podLogs, err := req.Stream()
		if err != nil {
			panic(err.Error())
		}
		defer podLogs.Close()
		buf := new(bytes.Buffer)
		_, err = io.Copy(buf, podLogs)
		if err != nil {
			panic(err.Error())
		}
		logs[index] = buf.String()
	}
	json.NewEncoder(w).Encode(logs)
}
